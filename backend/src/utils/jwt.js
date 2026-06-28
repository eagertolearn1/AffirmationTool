const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TTL  = parseInt(process.env.JWT_ACCESS_TTL  || '900',     10); // 15 min
const REFRESH_TTL = parseInt(process.env.JWT_REFRESH_TTL || '2592000', 10); // 30 days

/**
 * Sign a short-lived access token.
 */
function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

/**
 * Verify an access token. Returns decoded payload or throws.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * Generate a cryptographically random refresh token (raw bytes → hex string).
 * Returns { token, hash, expiresAt }.
 */
function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex'); // 96-char hex
  const hash  = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL * 1000);
  return { token, hash, expiresAt };
}

/**
 * Hash a refresh token for storage/comparison.
 */
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const REFRESH_COOKIE_NAME = 'rt';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   REFRESH_TTL * 1000,
    path:     '/api/auth',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
}

function getRefreshTokenFromCookie(req) {
  return req.cookies?.[REFRESH_COOKIE_NAME] || null;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromCookie,
};
