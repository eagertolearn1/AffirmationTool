// =============================================================
// Journey Routes
// Daily state management, unlock logic, counters
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/journey/current
 * Returns the user's active journey with current state.
 */
router.get('/current', requireAuth, async (req, res) => {
  // 1. Find journey with status='active' for user
  // 2. Run auto-unlock check: if previous day session created >24h ago and not completed,
  //    mark it 'expired', unlock next day
  // 3. Sync calendar_day = days since calendar_started_at
  // 4. Return { journey_id, track, current_affirmation_day, current_calendar_day,
  //             transformation_score, status, tier }
  res.json({ journey_id: '<uuid>', current_affirmation_day: 5, current_calendar_day: 7 });
});

/**
 * GET /api/journey/:journey_id/day/:day_number
 * Returns content and state for a specific affirmation day.
 * Returns signed URLs for audio + infographic (1hr TTL).
 */
router.get('/:journey_id/day/:day_number', requireAuth, async (req, res) => {
  // 1. Verify journey belongs to authenticated user
  // 2. Fetch affirmation_days record
  // 3. Fetch daily_sessions record for this day
  // 4. If day is locked: return { state: 'locked' } (no content)
  // 5. Generate signed R2 URLs for morning_audio_path and infographic_path
  // 6. If evening unlocked: also return signed URL for evening_audio_path
  // 7. Return { state, doubt, reframe, truth_statement, action_prompt,
  //             morning_audio_url, evening_audio_url, infographic_url,
  //             morning_completed, evening_completed }
  res.json({ state: 'morning_unlocked', truth_statement: '...' });
});

/**
 * POST /api/journey/:journey_id/day/:day_number/morning-complete
 * Called when user reaches 80%+ of morning audio.
 */
router.post('/:journey_id/day/:day_number/morning-complete', requireAuth, async (req, res) => {
  // 1. Verify day is in 'morning_unlocked' or 'locked' state (idempotent)
  // 2. Update daily_sessions: morning_completed_at = NOW(), state = 'evening_unlocked'
  // 3. Ensure daily_sessions row exists (create if first listen of the day)
  res.json({ state: 'evening_unlocked' });
});

/**
 * POST /api/journey/:journey_id/day/:day_number/evening-complete
 * Called when user reaches 80%+ of evening audio.
 */
router.post('/:journey_id/day/:day_number/evening-complete', requireAuth, async (req, res) => {
  // 1. Verify day is in 'evening_unlocked' state
  // 2. Update daily_sessions: evening_completed_at = NOW(), state = 'checkin_unlocked'
  res.json({ state: 'checkin_unlocked' });
});

/**
 * POST /api/journey/:journey_id/day/:day_number/checkin
 * Body: {
 *   believability_score,           -- always required
 *   doubt_score?,                  -- milestone days only
 *   resistance_score?,
 *   identity_score?,
 *   action_completed?,
 *   evidence_text?,
 *   rotating_question_key?,        -- non-milestone days
 *   rotating_question_score?
 * }
 */
router.post('/:journey_id/day/:day_number/checkin', requireAuth, async (req, res) => {
  // 1. Verify day is in 'checkin_unlocked' state
  // 2. Run crisis detection on evidence_text (if provided)
  // 3. Validate milestone fields present if is_milestone_day (days 1,7,14,21)
  // 4. Save check_in record
  // 5. Calculate new Transformation Score
  //    Score = (consistency×0.35 + believability_trend×0.25 + doubt_reduction×0.25 + action×0.15) × 100
  // 6. Update journey.transformation_score
  // 7. Mark daily_session: state='completed', checkin_completed_at=NOW()
  // 8. Increment journey.current_affirmation_day
  // 9. Unlock next day: create daily_sessions row for day+1 with state='morning_unlocked'
  // 10. Check achievement eligibility (run achievement_checker service)
  // 11. Enqueue progress-card BullMQ job
  // 12. POST to n8n: /webhooks/day-complete
  res.json({ transformation_score: 67, next_day_unlocked: true });
});

/**
 * GET /api/journey/:journey_id/generation-status
 * Polls content generation progress after payment.
 */
router.get('/:journey_id/generation-status', requireAuth, async (req, res) => {
  // 1. Count content_generation_jobs by status for this journey
  // 2. Return progress: { total, completed, failed, percent }
  res.json({ total: 65, completed: 12, failed: 0, percent: 18 });
});

module.exports = router;
