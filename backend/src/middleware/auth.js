const { verifyAccessToken } = require('../utils/jwt');
const { AuthenticationError, ForbiddenError } = require('../utils/errors');

/**
 * Verify JWT access token from Authorization: Bearer <token> header.
 * Attaches req.user = { userId, email } on success.
 */
function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AuthenticationError('No token provided');

    const token   = header.slice(7);
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch (err) {
    if (err instanceof AuthenticationError) return next(err);
    next(new AuthenticationError('Token invalid or expired'));
  }
}

/**
 * Require admin role. Must come after requireAuth.
 */
function requireAdmin(req, res, next) {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());
  if (!adminEmails.includes(req.user?.email)) {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
}

/**
 * Validate internal webhook secret (from n8n / BullMQ workers).
 */
function verifyWebhookSecret(req, res, next) {
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.N8N_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'INVALID_WEBHOOK_SECRET' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, verifyWebhookSecret };
