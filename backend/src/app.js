require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const cookieParser = require('cookie-parser');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const logger      = require('./utils/logger');
const routes      = require('./routes');

const app = express();

// ── Security ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods:     ['GET', 'POST', 'PATCH', 'DELETE'],
}));

// ── Parsing ─────────────────────────────────────────────────
// Raw body preserved for Razorpay webhook signature verification
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Rate limiting ────────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Request logging ──────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip }, 'incoming request');
  next();
});

// ── Health ───────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const { healthCheck } = require('./db');
    const dbTime = await healthCheck();
    res.json({ status: 'ok', db: dbTime });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

// ── API routes ───────────────────────────────────────────────
app.use('/api', routes);

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' }));

// ── Global error handler ─────────────────────────────────────
app.use(errorHandler);

module.exports = app;
