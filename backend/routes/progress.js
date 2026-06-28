// =============================================================
// Progress Dashboard Routes
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/progress/:journey_id/dashboard
 * Returns all data for the progress dashboard.
 */
router.get('/:journey_id/dashboard', requireAuth, async (req, res) => {
  // Returns:
  // {
  //   calendar_days: number,
  //   affirmation_days: number,
  //   transformation_score: number,
  //   transformation_score_history: [{ day, score }],
  //   consistency_rate: number,          -- 0-1
  //   current_streak: number,
  //   doubt_trend: [{ day, score }],
  //   believability_trend: [{ day, score }],
  //   action_completion: { yes, partially, no, total },
  //   identity_gap_close: { day1_believability, current_believability },
  //   sessions: [{ day, morning_listened, evening_listened, checkin_done, state }]
  // }
  res.json({});
});

/**
 * GET /api/progress/:journey_id/transformation-score
 * Returns just the current score + trend. Used for progress card generation.
 */
router.get('/:journey_id/transformation-score', requireAuth, async (req, res) => {
  // 1. Fetch latest check_in.transformation_score for this journey
  // 2. Fetch Day 1 score for comparison
  res.json({ current: 72, day1: 31, change: 41 });
});

module.exports = router;
