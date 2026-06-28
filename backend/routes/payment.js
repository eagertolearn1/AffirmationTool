// =============================================================
// Payment Routes — Razorpay
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

/**
 * POST /api/payment/create-order
 * Body: { journey_id, tier: 'standard'|'premium' }
 * Creates Razorpay order. Returns order_id for frontend checkout.
 *
 * Pricing:
 *   New journey:  Standard ₹999  | Premium ₹1,999
 *   Renewal same: Standard ₹699  | Premium ₹1,299
 *   Coaching credits: ₹99 per 10 credits
 */
router.post('/create-order', requireAuth, async (req, res) => {
  // 1. Validate journey belongs to authenticated user
  // 2. Calculate amount based on tier + renewal discount + video discount
  // 3. Call Razorpay Orders API: { amount (paise), currency: 'INR', receipt: journey_id }
  // 4. Create payment record in DB with status='pending'
  // 5. Return { order_id, amount, currency, key_id }
  res.json({ order_id: 'order_xxx', amount: 99900, currency: 'INR' });
});

/**
 * POST /api/payment/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Verifies payment signature server-side. NEVER trust frontend alone.
 */
router.post('/verify', requireAuth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  // 1. Verify signature:
  //    expected = HMAC-SHA256(razorpay_order_id + '|' + razorpay_payment_id, RAZORPAY_KEY_SECRET)
  //    Compare with razorpay_signature (constant-time comparison)
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  // 2. If signature mismatch: return 400, do NOT activate journey
  // 3. If valid:
  //    - Update payment record: status='completed', razorpay_payment_id
  //    - Update journey: status='generating', calendar_started_at = NOW()
  //    - Enqueue full content generation job in BullMQ
  //    - Post to n8n webhook: /webhooks/payment-confirmed
  res.json({ ok: true, journey_status: 'generating' });
});

/**
 * POST /api/payment/webhook
 * Razorpay webhook — backup verification in case frontend fails.
 * Validate X-Razorpay-Signature header.
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1. Verify webhook signature using RAZORPAY_WEBHOOK_SECRET
  // 2. Handle events:
  //    payment.captured → same as /verify logic above
  //    payment.failed   → update payment status to 'failed'
  //    refund.created   → update payment status to 'refunded'
  res.json({ ok: true });
});

/**
 * POST /api/payment/coaching-credits
 * Body: { pack: 10 } → charges ₹99
 * Adds coaching credits to user's balance.
 */
router.post('/coaching-credits', requireAuth, async (req, res) => {
  // 1. Create Razorpay order for ₹99
  // 2. After verification: upsert coaching_credits record, add credits_purchased
  res.json({ order_id: 'order_yyy', amount: 9900 });
});

module.exports = router;
