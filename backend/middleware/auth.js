// =============================================================
// Auth Middleware
// =============================================================

const jwt = require('jsonwebtoken');

/**
 * requireAuth — validates JWT access token from Authorization header.
 * Sets req.user = { userId, email }
 */
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'TOKEN_INVALID_OR_EXPIRED' });
  }
};

/**
 * requireAdmin — checks user has admin role.
 * Must be used after requireAuth.
 */
const requireAdmin = async (req, res, next) => {
  // 1. Check users table for admin flag (add is_admin column to schema if needed)
  // 2. Or use environment-defined admin email list
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',');
  if (!adminEmails.includes(req.user.email)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  next();
};

/**
 * verifyWebhookSecret — for internal webhooks from n8n and BullMQ workers.
 */
const verifyWebhookSecret = (req, res, next) => {
  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.N8N_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'INVALID_WEBHOOK_SECRET' });
  }
  next();
};

module.exports = { requireAuth, requireAdmin, verifyWebhookSecret };
