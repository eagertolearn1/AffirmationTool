// =============================================================
// Achievements Routes
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/achievements/:user_id
 * Returns all badges earned by this user across all journeys.
 */
router.get('/:user_id', requireAuth, async (req, res) => {
  // 1. Verify :user_id matches authenticated user
  // 2. Return achievements with badge_type, earned_at, card_url, journey context
  res.json({ achievements: [] });
});

/**
 * POST /api/achievements/check/:journey_id
 * Internal — called after each day completion to evaluate badge eligibility.
 * Also called by n8n after journey completion for final badge check.
 *
 * Achievement rules:
 *   journey_completer:    all 21 affirmation_days completed
 *   perfect_consistency:  affirmation_days = calendar_days = 21
 *   strong_momentum:      no gap in days 1-14 (14 consecutive completed sessions)
 *   comeback_champion:    had a gap of 3+ days AND still completed all 21 affirmation_days
 *   action_taker:         action_completed = 'yes' on >= 80% of milestone check-ins
 */
router.post('/check/:journey_id', requireAuth, async (req, res) => {
  // 1. Evaluate each badge condition against the journey's data
  // 2. Insert any newly earned badges into achievements table (ignore if already exists)
  // 3. Enqueue Bannerbear card generation for each new badge
  // 4. Return newly earned badges
  res.json({ new_badges: [] });
});

module.exports = router;
