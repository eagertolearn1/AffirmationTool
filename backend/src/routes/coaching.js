/**
 * Coaching Routes
 * AI coaching conversations with daily limits, credits system, and crisis detection.
 *
 * Daily limits:
 *   Standard: 5 messages/day
 *   Premium:  20 messages/day
 *   Credits:  purchasable, consumed when daily limit exhausted
 */
const express = require('express');
const { z }   = require('zod');
const db      = require('../db');
const ai      = require('../services/ai');
const { requireAuth } = require('../middleware/auth');
const { coachingLimiter } = require('../middleware/rateLimiter');
const { ValidationError, ForbiddenError, NotFoundError, CrisisDetectedError } = require('../utils/errors');
const logger  = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);
router.use(coachingLimiter);

// ── Limits ────────────────────────────────────────────────────
const DAILY_LIMITS = { standard: 5, premium: 20 };

const CRISIS_RESPONSE = {
  message: 'I hear that things feel really hard right now. Your wellbeing matters more than any affirmation journey.',
  resources: [
    { name: 'iCall (TISS)',          contact: '9152987821', hours: 'Mon–Sat 8am–10pm' },
    { name: 'Vandrevala Foundation', contact: '1860-2662-345', hours: '24/7' },
  ],
  action: 'Please reach out. These counselors are here for you.',
};

// ── Schemas ───────────────────────────────────────────────────
const sendMessageSchema = z.object({
  message:    z.string().min(1).max(2000),
  journey_id: z.string().uuid(),
});

const creditPurchaseSchema = z.object({
  quantity: z.number().int().min(1).max(100), // 1 credit = 1 message
});

// ─────────────────────────────────────────────────────────────
// GET /api/coaching/:journey_id/history
// Returns last 50 messages for context
// ─────────────────────────────────────────────────────────────
router.get('/:journey_id/history', async (req, res, next) => {
  try {
    const journey = await getJourneyForUser(req.params.journey_id, req.user.userId);

    const { rows } = await db.query(
      `SELECT id, role, content, created_at
       FROM coaching_messages
       WHERE journey_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [journey.id]
    );

    res.json({ messages: rows.reverse() }); // chronological order
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// GET /api/coaching/:journey_id/status
// Returns daily usage, limits, credits balance
// ─────────────────────────────────────────────────────────────
router.get('/:journey_id/status', async (req, res, next) => {
  try {
    const journey = await getJourneyForUser(req.params.journey_id, req.user.userId);
    const limit   = DAILY_LIMITS[journey.subscription_tier] || DAILY_LIMITS.standard;
    const used    = await getUsedToday(journey.id);
    const credits = await getCredits(req.user.userId);

    res.json({
      daily_limit:    limit,
      used_today:     used,
      remaining:      Math.max(0, limit - used),
      credits_balance: credits,
      can_message:    used < limit || credits > 0,
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/coaching/message
// Send a message to the AI coach
// ─────────────────────────────────────────────────────────────
router.post('/message', async (req, res, next) => {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.errors);

    const { message, journey_id } = parsed.data;
    const journey = await getJourneyForUser(journey_id, req.user.userId);

    // Check and enforce limits
    const limit  = DAILY_LIMITS[journey.subscription_tier] || DAILY_LIMITS.standard;
    const used   = await getUsedToday(journey.id);
    let useCredit = false;

    if (used >= limit) {
      const credits = await getCredits(req.user.userId);
      if (credits <= 0) {
        throw new ForbiddenError(
          `Daily limit of ${limit} messages reached. Purchase credits to continue.`
        );
      }
      useCredit = true;
    }

    // Crisis detection FIRST — always
    const crisis = await ai.detectCrisis(message);
    if (crisis.crisis_detected) {
      // Log anonymized crisis event
      await db.query(
        `INSERT INTO crisis_events (user_id, journey_id, trigger_context, crisis_type, resources_shown)
         VALUES ($1, $2, 'coaching', $3, $4)`,
        [req.user.userId, journey.id, crisis.crisis_type || 'unspecified',
         JSON.stringify(CRISIS_RESPONSE.resources)]
      );
      logger.warn({ userId: req.user.userId, crisis_type: crisis.crisis_type }, 'Crisis detected in coaching');

      // Save user message + crisis response (so history is coherent)
      await saveMessage(journey.id, req.user.userId, 'user',      message,                  'coaching_crisis');
      await saveMessage(journey.id, req.user.userId, 'assistant', CRISIS_RESPONSE.message,  'coaching_crisis');

      // Do NOT consume limit/credit for crisis responses
      return res.json({ crisis: true, response: CRISIS_RESPONSE });
    }

    // Fetch conversation history for context (last 20 messages)
    const { rows: history } = await db.query(
      `SELECT role, content FROM coaching_messages
       WHERE journey_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [journey.id]
    );
    const conversationHistory = history.reverse().map(m => ({ role: m.role, content: m.content }));

    // Fetch today's affirmation content for context
    const currentDay = journey.current_affirmation_day || 1;
    const { rows: [todayAff] } = await db.query(
      `SELECT truth_statement, doubt FROM affirmation_days WHERE journey_id = $1 AND day_number = $2`,
      [journey.id, currentDay]
    );

    // Get AI response
    const aiResponse = await ai.getCoachingResponse({
      userMessage:  message,
      journeyContext: {
        track:                   journey.track,
        current_affirmation_day: currentDay,
        problem_statement:       journey.problem_statement,
        goal_statement:          journey.goal_statement,
        inner_voice_belief:      journey.inner_voice_belief,
        identity_shift_needed:   journey.identity_shift_needed,
        transformation_score:    journey.transformation_score,
        todays_truth:            todayAff?.truth_statement || null,
        todays_doubt:            todayAff?.doubt || null,
      },
      conversationHistory,
    });

    // Extract text response from ai service result
    const responseText = aiResponse.response || aiResponse;

    // Save both messages
    await db.transaction(async (client) => {
      await saveMessage(journey.id, req.user.userId, 'user',      message,      'coaching', client);
      await saveMessage(journey.id, req.user.userId, 'assistant', responseText, 'coaching', client);

      // Consume credit (credits_used is tracked; credits_remaining is computed)
      if (useCredit) {
        await client.query(
          `UPDATE coaching_credits
           SET credits_used = credits_used + 1, updated_at = NOW()
           WHERE user_id = $1 AND credits_remaining > 0`,
          [req.user.userId]
        );
      }
    });

    res.json({ response: responseText, crisis: false });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/coaching/credits/add
// Add credits (called by payment service after purchase)
// Internal route — verified via webhook secret
// ─────────────────────────────────────────────────────────────
router.post('/credits/add', require('../middleware/auth').verifyWebhookSecret, async (req, res, next) => {
  try {
    const { user_id, quantity } = creditPurchaseSchema.extend({ user_id: z.string().uuid() }).parse(req.body);

    await db.query(
      `INSERT INTO coaching_credits (user_id, credits_purchased)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET credits_purchased = coaching_credits.credits_purchased + $2, updated_at = NOW()`,
      [user_id, quantity]
    );

    const { rows: [row] } = await db.query(
      'SELECT credits_purchased FROM coaching_credits WHERE user_id = $1',
      [user_id]
    );

    logger.info({ user_id, quantity, newBalance: row?.credits_purchased }, 'Coaching credits added');
    res.json({ success: true, new_balance: row?.credits_purchased || 0 });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function getJourneyForUser(journeyId, userId) {
  const { rows: [j] } = await db.query(
    `SELECT j.*, u.subscription_tier
     FROM journeys j
     JOIN users u ON u.id = j.user_id
     WHERE j.id = $1 AND j.user_id = $2`,
    [journeyId, userId]
  );
  if (!j) throw new NotFoundError('Journey not found');
  return j;
}

async function getUsedToday(journeyId) {
  const { rows: [r] } = await db.query(
    `SELECT COUNT(*) AS count
     FROM coaching_messages
     WHERE journey_id = $1
       AND role = 'user'
       AND created_at >= CURRENT_DATE`,
    [journeyId]
  );
  return parseInt(r.count);
}

async function getCredits(userId) {
  const { rows: [r] } = await db.query(
    'SELECT COALESCE(credits_remaining, 0) AS credits FROM coaching_credits WHERE user_id = $1',
    [userId]
  );
  return r ? parseInt(r.credits) : 0;
}

async function saveMessage(journeyId, userId, role, content, source = 'coaching', client = db) {
  await client.query(
    `INSERT INTO coaching_messages (journey_id, user_id, role, content, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [journeyId, userId, role, content, source]
  );
}

module.exports = router;
