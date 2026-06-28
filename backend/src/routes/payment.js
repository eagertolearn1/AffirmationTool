/**
 * Payment Routes — Razorpay integration
 *
 * Flow:
 *  1. POST /create-order  → frontend initiates Razorpay checkout
 *  2. Frontend completes payment in Razorpay modal
 *  3. POST /verify        → frontend sends signature for server-side verification
 *  4. POST /webhook       → Razorpay sends async event (payment.captured, payment.failed, etc.)
 *
 * After successful payment:
 *  - Subscription tier updated
 *  - Journey status moved from 'pending_payment' to 'onboarding'
 *  - n8n content pipeline webhook fired
 */
const express  = require('express');
const crypto   = require('crypto');
const Razorpay = require('razorpay');
const { z }    = require('zod');
const db       = require('../db');
const logger   = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { ValidationError, AppError } = require('../utils/errors');

const router = express.Router();

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ── Product catalogue ─────────────────────────────────────────
const PLANS = {
  standard:          { amount_paise: 99900,  label: 'Standard – ₹999/journey',       tier: 'standard' },
  premium:           { amount_paise: 199900, label: 'Premium – ₹1,999/journey',      tier: 'premium' },
  standard_renewal:  { amount_paise: 69900,  label: 'Standard Renewal – ₹699',       tier: 'standard', renewal: true },
  premium_renewal:   { amount_paise: 129900, label: 'Premium Renewal – ₹1,299',      tier: 'premium',  renewal: true },
  coaching_credits_5:  { amount_paise: 9900,  label: '5 Coaching Credits', credits: 5 },
  coaching_credits_20: { amount_paise: 29900, label: '20 Coaching Credits', credits: 20 },
};

// ── Schemas ───────────────────────────────────────────────────
const createOrderSchema = z.object({
  plan_id:    z.enum(Object.keys(PLANS)),
  journey_id: z.string().uuid().optional(), // required for journey plans, omit for credits
});

const verifySchema = z.object({
  razorpay_order_id:   z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature:  z.string(),
  plan_id:             z.string(),
  journey_id:          z.string().uuid().optional(),
});

// ─────────────────────────────────────────────────────────────
// POST /api/payment/create-order
// ─────────────────────────────────────────────────────────────
router.post('/create-order', requireAuth, async (req, res, next) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.errors);

    const { plan_id, journey_id } = parsed.data;
    const plan = PLANS[plan_id];

    // For journey plans, verify journey belongs to user and is pending payment
    if (plan.tier && journey_id) {
      const { rows: [j] } = await db.query(
        'SELECT id, status FROM journeys WHERE id = $1 AND user_id = $2',
        [journey_id, req.user.userId]
      );
      if (!j) throw new ValidationError('Journey not found');
      if (!['pending_payment', 'onboarding'].includes(j.status)) {
        throw new ValidationError('Journey is not awaiting payment');
      }
    }

    const order = await razorpay.orders.create({
      amount:   plan.amount_paise,
      currency: 'INR',
      receipt:  `rcpt_${Date.now()}`,
      notes: {
        user_id:    req.user.userId,
        journey_id: journey_id || '',
        plan_id,
      },
    });

    // Save pending payment record
    const paymentType = plan.credits ? 'coaching_credits' : 'new_journey';
    const planTier    = plan.tier || null;
    await db.query(
      `INSERT INTO payments
         (user_id, journey_id, razorpay_order_id, amount_paise, payment_type, tier, status)
       VALUES ($1, $2, $3, $4, $5::payment_type, $6::user_tier, 'pending')
       ON CONFLICT (razorpay_order_id) DO NOTHING`,
      [req.user.userId, journey_id || null, order.id, plan.amount_paise, paymentType, planTier]
    );

    logger.info({ userId: req.user.userId, orderId: order.id, plan_id }, 'Razorpay order created');

    res.json({
      order_id:    order.id,
      amount:      plan.amount_paise,
      currency:    'INR',
      key_id:      process.env.RAZORPAY_KEY_ID,
      description: plan.label,
    });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/payment/verify
// Frontend calls this after Razorpay modal closes with success
// ─────────────────────────────────────────────────────────────
router.post('/verify', requireAuth, async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.errors);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, journey_id } = parsed.data;

    // Verify HMAC signature (skip in non-production or when SKIP_SIG_CHECK is set)
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const sigCheckEnabled = process.env.NODE_ENV === 'production' && process.env.SKIP_SIG_CHECK !== 'true';
    if (sigCheckEnabled && expectedSig !== razorpay_signature) {
      logger.warn({ razorpay_order_id }, 'Payment signature mismatch');
      throw new AppError('Payment verification failed', 400, 'PAYMENT_SIGNATURE_MISMATCH');
    }
    if (!sigCheckEnabled) {
      logger.info({ razorpay_order_id, NODE_ENV: process.env.NODE_ENV }, 'Signature check skipped (dev/test mode)');
    }

    // Find payment record
    const { rows: [payment] } = await db.query(
      'SELECT * FROM payments WHERE razorpay_order_id = $1 AND user_id = $2',
      [razorpay_order_id, req.user.userId]
    );
    if (!payment) throw new AppError('Payment record not found', 404, 'PAYMENT_NOT_FOUND');

    // Idempotency guard
    if (payment.status === 'completed') {
      return res.json({ success: true, message: 'Already processed' });
    }

    await db.transaction(async (client) => {
      // Update payment record
      await client.query(
        `UPDATE payments
         SET status = 'completed', razorpay_payment_id = $1, updated_at = NOW()
         WHERE razorpay_order_id = $2`,
        [razorpay_payment_id, razorpay_order_id]
      );

      const plan = PLANS[plan_id];

      if (plan.tier && journey_id) {
        // Upgrade user tier
        await client.query(
          `UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2`,
          [plan.tier, req.user.userId]
        );
        if (plan.renewal) {
          // Renewal — mark old journey as 'renewed', create new one
          await client.query(
            `UPDATE journeys SET status = 'renewed', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
            [journey_id, req.user.userId]
          );
          await client.query(
            `INSERT INTO journeys (user_id, tier, status) VALUES ($1, $2, 'onboarding')`,
            [req.user.userId, plan.tier]
          );
        } else {
          // New journey — move past pending_payment
          await client.query(
            `UPDATE journeys SET status = 'onboarding', updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [journey_id, req.user.userId]
          );
        }
      }

      if (plan.credits) {
        // Add coaching credits
        await client.query(
          `INSERT INTO coaching_credits (user_id, credits_purchased)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET credits_purchased = coaching_credits.credits_purchased + $2, updated_at = NOW()`,
          [req.user.userId, plan.credits]
        );
      }
    });

    // Fire n8n content pipeline webhook (fire-and-forget)
    if (PLANS[plan_id].tier && journey_id) {
      fireContentPipelineWebhook(journey_id, req.user.userId).catch(err =>
        logger.error({ err, journey_id }, 'Content pipeline webhook failed')
      );
    }

    logger.info({ userId: req.user.userId, razorpay_payment_id, plan_id }, 'Payment verified and processed');
    res.json({ success: true });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/payment/webhook
// Razorpay async webhook — raw body required (configured in app.js)
// ─────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body      = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body); // express.raw() sets req.body as Buffer

    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSig !== signature) {
      logger.warn('Invalid Razorpay webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(body);
    logger.info({ event: event.event }, 'Razorpay webhook received');

    switch (event.event) {
      case 'payment.captured': {
        const payment = event.payload.payment.entity;
        await db.query(
          `UPDATE payments
           SET status = 'completed', razorpay_payment_id = $1, updated_at = NOW()
           WHERE razorpay_order_id = $2 AND status != 'completed'`,
          [payment.id, payment.order_id]
        );
        break;
      }
      case 'payment.failed': {
        const payment = event.payload.payment.entity;
        await db.query(
          `UPDATE payments SET status = 'failed' WHERE razorpay_order_id = $1`,
          [payment.order_id]
        );
        break;
      }
      case 'refund.created': {
        const refund = event.payload.refund.entity;
        await db.query(
          `UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE razorpay_payment_id = $1`,
          [refund.payment_id]
        );
        break;
      }
      default:
        logger.debug({ event: event.event }, 'Unhandled Razorpay webhook event');
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, 'Razorpay webhook processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/payment/history
// ─────────────────────────────────────────────────────────────
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, payment_type, tier, amount_paise, status, razorpay_payment_id, updated_at, created_at
       FROM payments
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.userId]
    );
    res.json({ payments: rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────
async function fireContentPipelineWebhook(journeyId, userId) {
  const axios = require('axios');
  const webhookUrl = process.env.N8N_WEBHOOK_URL_PAYMENT_CONFIRMED;
  if (!webhookUrl) return;

  await axios.post(webhookUrl, {
    journey_id: journeyId,
    user_id:    userId,
    event:      'payment-confirmed',
  }, {
    headers:  { 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET },
    timeout:  8_000,
  });
  logger.info({ journeyId }, 'Content pipeline webhook fired');
}

module.exports = router;
