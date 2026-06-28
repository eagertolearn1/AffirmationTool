// =============================================================
// Onboarding Routes
// 5-step flow — progressive save, auto-resume
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * POST /api/onboarding/start
 * Creates or resumes an onboarding journey.
 * Returns existing journey in 'onboarding' status if one exists.
 */
router.post('/start', requireAuth, async (req, res) => {
  // 1. Check for existing journey with status='onboarding' for this user
  // 2. If exists: return it (auto-resume)
  // 3. If not: create new journey record with status='onboarding'
  res.json({ journey_id: '<uuid>', step_reached: 1 });
});

/**
 * PATCH /api/onboarding/:journey_id/track
 * Body: { track }
 * Saves life track selection (Step 1).
 */
router.patch('/:journey_id/track', requireAuth, async (req, res) => {
  // 1. Validate track is a valid life_track enum value
  // 2. Update journey.track
  res.json({ ok: true });
});

/**
 * PATCH /api/onboarding/:journey_id/answers
 * Body: { problem_statement, goal_statement }
 * Saves Step 2 open questions.
 */
router.patch('/:journey_id/answers', requireAuth, async (req, res) => {
  // 1. Run crisis detection on both fields (call GPT-4o crisis check)
  // 2. If crisis detected: log to crisis_events, return crisis response (no save)
  // 3. Save problem_statement and goal_statement to journey
  res.json({ ok: true });
});

/**
 * POST /api/onboarding/:journey_id/surface-beliefs
 * Calls GPT-4o to generate: inner_voice_belief, identity_shift_needed, core_belief_to_change
 * based on problem_statement + goal_statement.
 */
router.post('/:journey_id/surface-beliefs', requireAuth, async (req, res) => {
  // 1. Fetch journey (must have problem_statement + goal_statement)
  // 2. Call GPT-4o with structured prompt
  // 3. Return suggestions — do NOT save yet (user must confirm/edit first)
  res.json({
    inner_voice_belief: 'I am not experienced enough...',
    identity_shift_needed: 'From imposter to trusted expert...',
    core_belief_to_change: 'I need to have all answers to add value'
  });
});

/**
 * PATCH /api/onboarding/:journey_id/confirm-beliefs
 * Body: { inner_voice_belief, identity_shift_needed, core_belief_to_change }
 * User confirms or edits the AI suggestions. Saves to journey. (Step 3)
 */
router.patch('/:journey_id/confirm-beliefs', requireAuth, async (req, res) => {
  // 1. Run crisis detection on all three fields
  // 2. Save confirmed beliefs to journey
  res.json({ ok: true });
});

/**
 * POST /api/onboarding/:journey_id/calibrate
 * Calls GPT-4o to generate 4-point preview: Day 1, 7, 14, 21 affirmations.
 */
router.post('/:journey_id/calibrate', requireAuth, async (req, res) => {
  // 1. Fetch all journey context
  // 2. Call GPT-4o to generate calibration preview
  // 3. Store in journey.calibration_data (JSONB)
  // 4. Return preview to frontend
  res.json({
    day_1:  { doubt: '...', truth: '...' },
    day_7:  { doubt: '...', truth: '...' },
    day_14: { doubt: '...', truth: '...' },
    day_21: { doubt: '...', truth: '...' }
  });
});

/**
 * PATCH /api/onboarding/:journey_id/calibration-feedback
 * Body: { day1_believable: 'yes'|'slightly_too_big'|'way_too_big', day21_too_small: boolean }
 * Stores calibration feedback and triggers re-calibration if needed.
 */
router.patch('/:journey_id/calibration-feedback', requireAuth, async (req, res) => {
  // 1. Save feedback to calibration_data JSONB
  // 2. If feedback indicates adjustment needed: call GPT-4o to re-calibrate
  // 3. Return final calibration_data
  res.json({ calibration_data: {} });
});

/**
 * PATCH /api/onboarding/:journey_id/preferences
 * Body: { language, music_style }
 * Saves Step 5 content preferences.
 */
router.patch('/:journey_id/preferences', requireAuth, async (req, res) => {
  // 1. Validate language and music_style enums
  // 2. Save to journey
  // 3. Mark onboarding_completed_at
  res.json({ ok: true });
});

/**
 * POST /api/onboarding/:journey_id/generate-preview
 * Triggers high-priority preview generation job (Day 1 audio + infographic).
 * This runs BEFORE payment — user sees their real Day 1 content.
 */
router.post('/:journey_id/generate-preview', requireAuth, async (req, res) => {
  // 1. Validate onboarding is complete (all fields present)
  // 2. Enqueue preview-generation job in BullMQ (high priority)
  // 3. Create content_generation_jobs record
  // 4. Return job_id for polling
  res.json({ job_id: '<bull_job_id>', status: 'queued' });
});

/**
 * GET /api/onboarding/:journey_id/preview-status
 * Polls preview generation status.
 */
router.get('/:journey_id/preview-status', requireAuth, async (req, res) => {
  // 1. Check content_generation_jobs for this journey, type='preview_generation'
  // 2. If complete: return signed URLs for Day 1 audio preview + infographic
  res.json({ status: 'ready', audio_url: '<signed_url>', infographic_url: '<signed_url>' });
});

module.exports = router;
