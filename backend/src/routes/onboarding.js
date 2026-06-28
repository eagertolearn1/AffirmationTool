const express = require('express');
const router  = express.Router();

const db      = require('../db');
const ai      = require('../services/ai');
const { requireAuth } = require('../middleware/auth');
const {
  trackSchema, answersSchema, confirmBeliefsSchema,
  calibrationFeedbackSchema, preferencesSchema,
} = require('../validators/onboarding.validators');
const { NotFoundError, AppError } = require('../utils/errors');
const logger  = require('../utils/logger');

const CRISIS_RESPONSE = {
  crisis: true,
  message: "I can hear that something difficult is happening right now. Please know you're not alone.",
  resources: [
    { name: 'iCall', number: '9152987821', description: 'Free psychological counselling' },
    { name: 'Vandrevala Foundation', number: '1860-2662-345', description: '24/7 mental health support' },
  ],
};

// Helper: get owned journey in 'onboarding' status
async function getOnboardingJourney(journeyId, userId) {
  const { rows } = await db.query(
    `SELECT * FROM journeys WHERE id = $1 AND user_id = $2 AND status = 'onboarding'`,
    [journeyId, userId]
  );
  if (rows.length === 0) throw new NotFoundError('Onboarding journey');
  return rows[0];
}

// ── POST /api/onboarding/start ───────────────────────────────
router.post('/start', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.user;

    // Resume existing onboarding if present
    const { rows: existing } = await db.query(
      `SELECT id, track, language, music_style, problem_statement, goal_statement,
              inner_voice_belief, identity_shift_needed, core_belief_to_change,
              calibration_data
       FROM journeys
       WHERE user_id = $1 AND status = 'onboarding'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (existing.length > 0) {
      const j = existing[0];
      // Determine how far they got
      let step = 1;
      if (j.track)                       step = 2;
      if (j.problem_statement)           step = 3;
      if (j.inner_voice_belief)          step = 4;
      if (j.calibration_data)            step = 5;
      return res.json({ journey_id: j.id, step_reached: step, resumed: true, journey: j });
    }

    // Create new journey
    const { rows } = await db.query(
      `INSERT INTO journeys (user_id, status)
       VALUES ($1, 'onboarding')
       RETURNING id`,
      [userId]
    );

    res.json({ journey_id: rows[0].id, step_reached: 1, resumed: false });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/onboarding/:journey_id/track ──────────────────
router.patch('/:journey_id/track', requireAuth, async (req, res, next) => {
  try {
    const { track } = trackSchema.parse(req.body);
    await getOnboardingJourney(req.params.journey_id, req.user.userId);

    await db.query(
      'UPDATE journeys SET track = $1, updated_at = NOW() WHERE id = $2',
      [track, req.params.journey_id]
    );
    res.json({ ok: true, step: 2 });
  } catch (err) { next(err); }
});

// ── PATCH /api/onboarding/:journey_id/answers ────────────────
router.patch('/:journey_id/answers', requireAuth, async (req, res, next) => {
  try {
    const { problem_statement, goal_statement } = answersSchema.parse(req.body);
    await getOnboardingJourney(req.params.journey_id, req.user.userId);

    // Crisis detection on both text fields
    const [pc, gc] = await Promise.all([
      ai.detectCrisis(problem_statement),
      ai.detectCrisis(goal_statement),
    ]);
    if (pc.crisis_detected || gc.crisis_detected) {
      await db.query(
        `INSERT INTO crisis_events (user_id, journey_id, trigger_context, crisis_type, resources_shown)
         VALUES ($1, $2, 'onboarding', $3, $4)`,
        [req.user.userId, req.params.journey_id,
         pc.crisis_type || gc.crisis_type,
         JSON.stringify(CRISIS_RESPONSE.resources)]
      );
      return res.json(CRISIS_RESPONSE);
    }

    await db.query(
      `UPDATE journeys
       SET problem_statement = $1, goal_statement = $2, updated_at = NOW()
       WHERE id = $3`,
      [problem_statement, goal_statement, req.params.journey_id]
    );
    res.json({ ok: true, step: 3 });
  } catch (err) { next(err); }
});

// ── POST /api/onboarding/:journey_id/surface-beliefs ─────────
router.post('/:journey_id/surface-beliefs', requireAuth, async (req, res, next) => {
  try {
    const journey = await getOnboardingJourney(req.params.journey_id, req.user.userId);
    if (!journey.problem_statement || !journey.goal_statement) {
      throw new AppError('Complete Step 2 answers before surfacing beliefs', 400, 'STEP_INCOMPLETE');
    }

    const beliefs = await ai.surfaceBeliefs({
      track:             journey.track,
      problem_statement: journey.problem_statement,
      goal_statement:    journey.goal_statement,
    });

    // Return suggestions only — user must confirm before saving
    res.json({ beliefs, step: 3 });
  } catch (err) {
    if (err.crisis) return res.json(CRISIS_RESPONSE);
    next(err);
  }
});

// ── PATCH /api/onboarding/:journey_id/confirm-beliefs ────────
router.patch('/:journey_id/confirm-beliefs', requireAuth, async (req, res, next) => {
  try {
    const body = confirmBeliefsSchema.parse(req.body);
    await getOnboardingJourney(req.params.journey_id, req.user.userId);

    // Crisis check on all three fields
    const checks = await Promise.all(
      Object.values(body).map(text => ai.detectCrisis(text))
    );
    if (checks.some(c => c.crisis_detected)) {
      await db.query(
        `INSERT INTO crisis_events (user_id, journey_id, trigger_context, crisis_type, resources_shown)
         VALUES ($1, $2, 'onboarding', 'beliefs_input', $3)`,
        [req.user.userId, req.params.journey_id, JSON.stringify(CRISIS_RESPONSE.resources)]
      );
      return res.json(CRISIS_RESPONSE);
    }

    await db.query(
      `UPDATE journeys
       SET inner_voice_belief    = $1,
           identity_shift_needed = $2,
           core_belief_to_change = $3,
           updated_at            = NOW()
       WHERE id = $4`,
      [body.inner_voice_belief, body.identity_shift_needed, body.core_belief_to_change, req.params.journey_id]
    );
    res.json({ ok: true, step: 4 });
  } catch (err) { next(err); }
});

// ── POST /api/onboarding/:journey_id/calibrate ───────────────
router.post('/:journey_id/calibrate', requireAuth, async (req, res, next) => {
  try {
    const journey = await getOnboardingJourney(req.params.journey_id, req.user.userId);
    if (!journey.inner_voice_belief) {
      throw new AppError('Complete Step 3 beliefs before calibrating', 400, 'STEP_INCOMPLETE');
    }

    const preview = await ai.generateCalibrationPreview({
      track:                 journey.track,
      problem_statement:     journey.problem_statement,
      goal_statement:        journey.goal_statement,
      inner_voice_belief:    journey.inner_voice_belief,
      identity_shift_needed: journey.identity_shift_needed,
      core_belief_to_change: journey.core_belief_to_change,
    });

    // Store preview in calibration_data
    const calibrationData = { preview, feedback: null };
    await db.query(
      'UPDATE journeys SET calibration_data = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(calibrationData), req.params.journey_id]
    );

    res.json({ preview, step: 4 });
  } catch (err) { next(err); }
});

// ── PATCH /api/onboarding/:journey_id/calibration-feedback ───
router.patch('/:journey_id/calibration-feedback', requireAuth, async (req, res, next) => {
  try {
    const feedback = calibrationFeedbackSchema.parse(req.body);
    const journey  = await getOnboardingJourney(req.params.journey_id, req.user.userId);

    let calibrationData = journey.calibration_data || {};
    let { preview } = calibrationData;

    // Recalibrate if user wants changes
    const needsChange = feedback.day1_believable !== 'yes' || feedback.day21_feel !== 'yes';
    if (needsChange && preview) {
      preview = await ai.recalibratePreview(preview, {
        day1_too_big:    feedback.day1_believable !== 'yes' ? feedback.day1_believable : null,
        day21_too_small: feedback.day21_feel === 'too_small',
        day21_too_big:   feedback.day21_feel === 'too_big',
      }, {
        track: journey.track,
        problem_statement: journey.problem_statement,
      });
    }

    calibrationData = { preview, feedback, confirmed: true };
    await db.query(
      'UPDATE journeys SET calibration_data = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(calibrationData), req.params.journey_id]
    );

    res.json({ preview, calibration_data: calibrationData, step: 4 });
  } catch (err) { next(err); }
});

// ── PATCH /api/onboarding/:journey_id/preferences ────────────
router.patch('/:journey_id/preferences', requireAuth, async (req, res, next) => {
  try {
    const { language, music_style } = preferencesSchema.parse(req.body);
    await getOnboardingJourney(req.params.journey_id, req.user.userId);

    await db.query(
      `UPDATE journeys
       SET language = $1, music_style = $2, onboarding_completed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [language, music_style, req.params.journey_id]
    );
    res.json({ ok: true, step: 5, onboarding_complete: true });
  } catch (err) { next(err); }
});

// ── POST /api/onboarding/:journey_id/generate-preview ────────
router.post('/:journey_id/generate-preview', requireAuth, async (req, res, next) => {
  try {
    const { journey_id } = req.params;
    const { rows } = await db.query(
      `SELECT * FROM journeys
       WHERE id = $1 AND user_id = $2 AND status = 'onboarding' AND onboarding_completed_at IS NOT NULL`,
      [journey_id, req.user.userId]
    );
    if (rows.length === 0) throw new AppError('Complete all onboarding steps first', 400, 'ONBOARDING_INCOMPLETE');

    // Enqueue preview generation job (BullMQ)
    const { previewQueue } = require('../workers');
    const job = await previewQueue.add('generate-preview', {
      journey_id,
      user_id: req.user.userId,
    }, { priority: 1 }); // Priority 1 = highest

    // Track in DB
    await db.query(
      `INSERT INTO content_generation_jobs (journey_id, job_type, status, bull_job_id)
       VALUES ($1, 'preview_generation', 'queued', $2)`,
      [journey_id, String(job.id)]
    );

    logger.info({ journey_id, jobId: job.id }, 'Preview generation enqueued');
    res.json({ job_id: String(job.id), status: 'queued' });
  } catch (err) { next(err); }
});

// ── GET /api/onboarding/:journey_id/preview-status ───────────
router.get('/:journey_id/preview-status', requireAuth, async (req, res, next) => {
  try {
    const { journey_id } = req.params;
    const { rows } = await db.query(
      `SELECT status, error_message FROM content_generation_jobs
       WHERE journey_id = $1 AND job_type = 'preview_generation'
       ORDER BY created_at DESC LIMIT 1`,
      [journey_id]
    );

    if (rows.length === 0) return res.json({ status: 'not_started' });

    if (rows[0].status === 'completed') {
      // Get signed URLs for Day 1 preview assets
      const { getSignedUrl } = require('../services/storage');
      const { rows: dayRows } = await db.query(
        `SELECT morning_audio_path, infographic_path FROM affirmation_days
         WHERE journey_id = $1 AND day_number = 1`,
        [journey_id]
      );

      if (dayRows.length > 0 && dayRows[0].morning_audio_path) {
        // Get the short preview clip path (stored separately)
        const previewAudioPath = dayRows[0].morning_audio_path.replace('morning.mp3', 'preview.mp3');
        const [audio_url, infographic_url] = await Promise.all([
          getSignedUrl(previewAudioPath),
          getSignedUrl(dayRows[0].infographic_path),
        ]);
        return res.json({ status: 'ready', audio_url, infographic_url });
      }
    }

    res.json({ status: rows[0].status, error: rows[0].error_message });
  } catch (err) { next(err); }
});

module.exports = router;
