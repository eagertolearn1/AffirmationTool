// =============================================================
// AI Coaching Routes
// Daily limit enforcement + crisis detection
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

const DAILY_LIMITS = { standard: 5, premium: 20 };

/**
 * GET /api/coaching/:journey_id/messages
 * Returns coaching history for a journey (last 50 messages).
 */
router.get('/:journey_id/messages', requireAuth, async (req, res) => {
  // 1. Verify journey belongs to user
  // 2. Return coaching_messages ordered by created_at DESC, limit 50
  res.json({ messages: [] });
});

/**
 * POST /api/coaching/:journey_id/message
 * Body: { content: string, source?: 'app'|'whatsapp'|'telegram' }
 * Enforces daily limit. Runs crisis detection. Returns AI response.
 */
router.post('/:journey_id/message', requireAuth, async (req, res) => {
  const { content, source = 'app' } = req.body;

  // 1. Run crisis detection FIRST (before limit check — always check safety)
  //    Call GPT-4o crisis detector
  //    If crisis_detected: log to crisis_events, return crisis response, STOP

  // 2. Count today's user messages for this journey
  //    SELECT COUNT(*) FROM coaching_messages
  //    WHERE journey_id = :id AND role = 'user' AND coaching_date = CURRENT_DATE

  // 3. Get user tier from journey → payment
  //    const limit = DAILY_LIMITS[tier]

  // 4. If count >= limit:
  //    Check coaching_credits.credits_remaining > 0
  //    If yes: deduct 1 credit (UPDATE coaching_credits SET credits_used = credits_used + 1)
  //    If no:  return 429 { error: 'DAILY_LIMIT_REACHED', limit, resets_at: '<tomorrow midnight>' }

  // 5. Save user message to coaching_messages

  // 6. Build GPT-4o context:
  //    - System prompt with: user's journey context (problem, goal, beliefs, identity statement),
  //      current affirmation day content, today's check-in data if available
  //    - Last 10 messages as conversation history
  //    - Instruction: respond as calm, experienced mentor; reference their specific situation

  // 7. Call GPT-4o, save assistant response to coaching_messages

  // 8. Return { message: assistantResponse, interactions_today: count+1, daily_limit: limit }

  res.json({ message: 'AI response here', interactions_today: 3, daily_limit: 5 });
});

/**
 * GET /api/coaching/:journey_id/credits
 * Returns daily usage + credit balance.
 */
router.get('/:journey_id/credits', requireAuth, async (req, res) => {
  // 1. Count today's messages
  // 2. Get tier limit
  // 3. Get credits balance
  res.json({ used_today: 3, daily_limit: 5, credits_remaining: 0, resets_at: '<tomorrow>' });
});

module.exports = router;
