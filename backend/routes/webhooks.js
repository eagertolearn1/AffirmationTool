// =============================================================
// Webhook Routes
// Inbound from: n8n, BullMQ workers, WhatsApp
// =============================================================

const express = require('express');
const router = express.Router();
const { verifyWebhookSecret } = require('../middleware/webhookAuth');

/**
 * POST /api/webhooks/content-ready
 * Called by BullMQ worker when a content generation job completes.
 * Body: { journey_id, job_type, day_number?, asset_url }
 */
router.post('/content-ready', verifyWebhookSecret, async (req, res) => {
  const { journey_id, job_type, day_number, asset_url } = req.body;

  // 1. Update affirmation_days or journey record with completed asset URL
  // 2. Check if ALL jobs for this journey are complete
  // 3. If complete: update journey.status = 'active'
  // 4. Push notification to user: "Your journey is ready"
  // 5. POST to n8n: /webhooks/journey-activated (triggers first WhatsApp message)

  res.json({ ok: true });
});

/**
 * POST /api/webhooks/whatsapp
 * Inbound WhatsApp messages (via Interakt/WATI webhook).
 * Routes user messages to AI coaching engine.
 */
router.post('/whatsapp', async (req, res) => {
  // 1. Verify WhatsApp webhook token
  // 2. Extract: from (phone number), message text, message_id
  // 3. Find user by whatsapp_number
  // 4. Find user's active journey
  // 5. POST to /api/coaching/:journey_id/message with source='whatsapp'
  // 6. Send AI response back via WhatsApp API
  // 7. Respond 200 immediately (WhatsApp requires fast ACK)

  res.json({ ok: true });
});

/**
 * GET /api/webhooks/whatsapp
 * WhatsApp webhook verification challenge (Meta requires this).
 */
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/**
 * POST /api/webhooks/progress-card-ready
 * Called by Bannerbear when a progress card render is complete.
 * Body: { journey_id, day_number, card_url }
 */
router.post('/progress-card-ready', verifyWebhookSecret, async (req, res) => {
  const { journey_id, day_number, card_url } = req.body;

  // 1. Save card_url to daily_sessions.progress_card_url
  // 2. Insert into progress_cards table
  // 3. Send WhatsApp message with card attached (if user opted in)

  res.json({ ok: true });
});

module.exports = router;
