const express  = require('express');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const router   = express.Router();

const db       = require('../db');
const { sendOtpEmail } = require('../services/email');
const {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromCookie,
} = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');
const { otpLimiter }  = require('../middleware/rateLimiter');
const { signupSchema, loginSchema, verifyOtpSchema } = require('../validators/auth.validators');
const { ValidationError, AuthenticationError, NotFoundError } = require('../utils/errors');
const logger   = require('../utils/logger');

const OTP_TTL_MINUTES = 10;
const BCRYPT_ROUNDS   = 10;

/** Generate a 6-digit OTP */
function generateOtp() {
  return String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, '0');
}

// ── POST /api/auth/signup ────────────────────────────────────
router.post('/signup', otpLimiter, async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body);
    const { name, email, whatsapp_number, whatsapp_opted_in } = body;

    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1 AND is_deleted = false',
      [email]
    );

    let userId;
    if (existingUser.rows.length > 0) {
      // User already exists — treat as login (just send OTP)
      userId = existingUser.rows[0].id;
    } else {
      // Create new user
      const { rows } = await db.query(
        `INSERT INTO users (name, email, whatsapp_number, whatsapp_opted_in, age_confirmed)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [name, email, whatsapp_number || null, whatsapp_opted_in]
      );
      userId = rows[0].id;

      // Log consent records
      await db.query(
        `INSERT INTO consent_log (user_id, consent_type, consented, ip_address)
         VALUES ($1, 'terms', true, $2),
                ($1, 'whatsapp', $3, $2)`,
        [userId, req.ip, whatsapp_opted_in]
      );
    }

    // Generate + hash OTP
    const otp      = generateOtp();
    const otpHash  = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await db.query(
      `INSERT INTO auth_otps (user_id, email, otp_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, email, otpHash, expiresAt]
    );

    // Send email (don't await — fire and forget, but log errors)
    sendOtpEmail(email, name, otp).catch(err =>
      logger.error({ err, email }, 'OTP email delivery failed after DB insert')
    );

    logger.info({ email }, 'Signup OTP sent');
    res.json({ message: 'OTP sent to your email. Valid for 10 minutes.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', otpLimiter, async (req, res, next) => {
  try {
    const { email } = loginSchema.parse(req.body);

    const { rows } = await db.query(
      'SELECT id, name FROM users WHERE email = $1 AND is_deleted = false',
      [email]
    );
    if (rows.length === 0) throw new NotFoundError('User');

    const { id: userId, name } = rows[0];
    const otp      = generateOtp();
    const otpHash  = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await db.query(
      `INSERT INTO auth_otps (user_id, email, otp_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, email, otpHash, expiresAt]
    );

    sendOtpEmail(email, name, otp).catch(err =>
      logger.error({ err, email }, 'OTP email delivery failed')
    );

    res.json({ message: 'OTP sent to your email. Valid for 10 minutes.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/verify-otp ────────────────────────────────
router.post('/verify-otp', otpLimiter, async (req, res, next) => {
  try {
    const { email, otp } = verifyOtpSchema.parse(req.body);

    // Fetch latest unused, unexpired OTP for this email
    const { rows: otpRows } = await db.query(
      `SELECT ao.id, ao.otp_hash, ao.user_id, u.name, u.email
       FROM auth_otps ao
       JOIN users u ON u.id = ao.user_id
       WHERE ao.email = $1
         AND ao.used = false
         AND ao.expires_at > NOW()
       ORDER BY ao.created_at DESC
       LIMIT 1`,
      [email]
    );

    if (otpRows.length === 0) {
      throw new AuthenticationError('OTP expired or not found. Request a new one.');
    }

    const row = otpRows[0];
    const valid = await bcrypt.compare(otp, row.otp_hash);
    if (!valid) throw new AuthenticationError('Invalid OTP');

    // Mark OTP used
    await db.query('UPDATE auth_otps SET used = true WHERE id = $1', [row.id]);

    // Issue tokens
    const accessToken  = signAccessToken({ userId: row.user_id, email: row.email });
    const { token: refreshToken, hash: refreshHash, expiresAt: refreshExpiry } = generateRefreshToken();

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [row.user_id, refreshHash, refreshExpiry]
    );

    setRefreshCookie(res, refreshToken);

    logger.info({ userId: row.user_id }, 'User authenticated');
    res.json({
      accessToken,
      user: { id: row.user_id, name: row.name, email: row.email },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const rawToken = getRefreshTokenFromCookie(req);
    if (!rawToken) throw new AuthenticationError('No refresh token');

    const tokenHash = hashRefreshToken(rawToken);

    const { rows } = await db.query(
      `SELECT rt.user_id, u.email, u.name
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.revoked = false
         AND rt.expires_at > NOW()
         AND u.is_deleted = false`,
      [tokenHash]
    );

    if (rows.length === 0) throw new AuthenticationError('Refresh token invalid or expired');

    const { user_id, email, name } = rows[0];
    const accessToken = signAccessToken({ userId: user_id, email });

    res.json({ accessToken, user: { id: user_id, name, email } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const rawToken = getRefreshTokenFromCookie(req);
    if (rawToken) {
      const tokenHash = hashRefreshToken(rawToken);
      await db.query(
        'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
        [tokenHash]
      );
    }
    clearRefreshCookie(res);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
