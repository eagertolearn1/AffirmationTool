// =============================================================
// Auth Routes
// Email OTP — no passwords
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * POST /api/auth/signup
 * Body: { name, email, whatsapp_number, whatsapp_opted_in, age_confirmed }
 * Creates user (if new) and sends OTP to email.
 */
router.post('/signup', async (req, res) => {
  // 1. Validate body
  // 2. Check age_confirmed === true (block if false)
  // 3. Upsert user record
  // 4. Generate 6-digit OTP, hash with bcrypt, store in auth_otps (expires 10 min)
  // 5. Send OTP via email (Resend / SendGrid)
  // 6. Log consent: 'whatsapp' and 'terms' in consent_log
  res.json({ message: 'OTP sent' });
});

/**
 * POST /api/auth/login
 * Body: { email }
 * Sends OTP to existing user. Returns 404 if user not found.
 */
router.post('/login', async (req, res) => {
  // 1. Find user by email (must exist)
  // 2. Generate + send OTP
  res.json({ message: 'OTP sent' });
});

/**
 * POST /api/auth/verify-otp
 * Body: { email, otp }
 * Verifies OTP. Returns access token (JWT, 15min) + sets httpOnly refresh cookie.
 */
router.post('/verify-otp', async (req, res) => {
  // 1. Find latest unused, unexpired OTP for email
  // 2. Compare OTP with bcrypt hash
  // 3. Mark OTP as used
  // 4. Sign JWT access token { userId, email } with 15min expiry
  // 5. Create refresh token (random, hashed, 30-day TTL), store in refresh_tokens
  // 6. Set refresh token in httpOnly cookie
  // 7. Return { accessToken, user: { id, name, email } }
  res.json({ accessToken: '<token>', user: {} });
});

/**
 * POST /api/auth/refresh
 * No body — reads refresh token from httpOnly cookie.
 * Returns new access token.
 */
router.post('/refresh', async (req, res) => {
  // 1. Read refresh token from cookie
  // 2. Find + validate in refresh_tokens table
  // 3. Issue new JWT access token
  res.json({ accessToken: '<new_token>' });
});

/**
 * POST /api/auth/logout
 * Revokes refresh token, clears cookie.
 */
router.post('/logout', requireAuth, async (req, res) => {
  // 1. Mark refresh token as revoked
  // 2. Clear httpOnly cookie
  res.json({ message: 'Logged out' });
});

module.exports = router;
