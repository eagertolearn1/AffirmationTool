/**
 * Internal Webhook Routes — called by n8n and content workers
 * All routes verified via x-webhook-secret header.
 */
const express = require('express');
const db      = require('../db');
const storage = require('../services/storage');
const { verifyWebhookSecret } = require('../middleware/auth');
const { progressCardQueue }   = require('../workers/index');
const logger  = require('../utils/logger');

const router = express.Router();
router.use(verifyWebhookSecret);

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/content-ready
// Fired when a journey's full content is ready
// (triggers FCM push to user + WhatsApp via n8n)
// ─────────────────────────────────────────────────────────────
router.post('/content-ready', async (req, res) => {
  const { journey_id } = req.body;
  if (!journey_id) return res.status(400).json({ error: 'journey_id required' });

  try {
    const { rows: [j] } = await db.query(
      `SELECT j.id, u.id AS user_id, u.name, u.whatsapp_number, u.whatsapp_opted_in
       FROM journeys j JOIN users u ON u.id = j.user_id
       WHERE j.id = $1`,
      [journey_id]
    );
    if (!j) return res.status(404).json({ error: 'Journey not found' });

    // Log notification intent
    await db.query(
      `INSERT INTO notification_log (user_id, channel, template_name, payload)
       VALUES ($1, 'push', 'journey_ready', $2)`,
      [j.user_id, JSON.stringify({ journey_id })]
    );

    logger.info({ journey_id, userId: j.user_id }, 'Content-ready webhook processed');
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, journey_id }, 'Content-ready webhook error');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/progress-card-ready
// n8n calls this after a progress card is ready — fire WhatsApp
// ─────────────────────────────────────────────────────────────
router.post('/progress-card-ready', async (req, res) => {
  const { journey_id, day_number } = req.body;
  if (!journey_id || !day_number) return res.status(400).json({ error: 'journey_id and day_number required' });

  try {
    // Signed URL for the card
    const cardPath = storage.progressCardPath(journey_id, day_number);
    const cardUrl  = await storage.getSignedUrl(cardPath);

    await db.query(
      `INSERT INTO notification_log (user_id, channel, template_name, payload)
       SELECT j.user_id, 'whatsapp', 'day_complete', $1
       FROM journeys j WHERE j.id = $2`,
      [JSON.stringify({ journey_id, day_number, card_url: cardUrl }), journey_id]
    );

    logger.info({ journey_id, day_number }, 'Progress-card-ready webhook processed');
    res.json({ ok: true, card_url: cardUrl });
  } catch (err) {
    logger.error({ err }, 'Progress-card-ready webhook error');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/whatsapp
// Inbound WhatsApp messages routed from Interakt/WATI
// ─────────────────────────────────────────────────────────────
router.post('/whatsapp', async (req, res) => {
  try {
    const { from, body: messageBody, type } = req.body;
    logger.info({ from, type }, 'Inbound WhatsApp message');

    // Look up user by whatsapp_number
    const { rows: [u] } = await db.query(
      'SELECT id FROM users WHERE whatsapp_number = $1 AND whatsapp_opted_in = true',
      [from]
    );

    if (!u) {
      logger.warn({ from }, 'WhatsApp message from unknown/opted-out number');
      return res.json({ ok: true });
    }

    // Handle STOP opt-out command
    if (type === 'text' && typeof messageBody === 'string' && messageBody.trim().toUpperCase() === 'STOP') {
      await db.query(
        'UPDATE users SET whatsapp_opted_in = false WHERE id = $1',
        [u.id]
      );
      await db.query(
        `INSERT INTO consent_log (user_id, consent_type, granted, source) VALUES ($1, 'whatsapp', false, 'whatsapp_stop')`,
        [u.id]
      );
      logger.info({ userId: u.id }, 'User opted out via WhatsApp STOP');
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'WhatsApp webhook error');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/enqueue-progress-card
// Called by journey route after check-in completes
// Enqueues progress card render job
// ─────────────────────────────────────────────────────────────
router.post('/enqueue-progress-card', async (req, res) => {
  const { journey_id, day_number, session_id } = req.body;
  if (!journey_id || !day_number) return res.status(400).json({ error: 'Missing fields' });

  try {
    await progressCardQueue.add('render-progress-card', { journey_id, day_number, session_id },
      { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } });
    res.json({ queued: true });
  } catch (err) {
    logger.error({ err }, 'Enqueue progress card error');
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
