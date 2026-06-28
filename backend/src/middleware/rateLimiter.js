const rateLimit = require('express-rate-limit');

/** OTP endpoints — strict to prevent abuse */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many OTP requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** General API — generous */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Coaching endpoint — coarser window to complement per-journey daily limit */
const coachingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many coaching requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { otpLimiter, apiLimiter, coachingLimiter };
