const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * Global error handler — last middleware in the Express chain.
 * Operational AppErrors → clean JSON response.
 * Unexpected errors    → 500 + logged fully.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Zod validation errors (from express-zod or manual .parse())
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  if (err instanceof AppError && err.isOperational) {
    const body = { error: err.code, message: err.message };
    if (err.details)    body.details    = err.details;
    if (err.retryAfter) body.retryAfter = err.retryAfter;
    return res.status(err.statusCode).json(body);
  }

  // Unexpected (programmer) error — don't leak internals
  logger.error({ err, req: { method: req.method, url: req.url, body: req.body } },
    'Unhandled error');

  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again.',
  });
}

module.exports = errorHandler;
