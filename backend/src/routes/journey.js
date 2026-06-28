const express = require('express');
const router  = express.Router();
const { z }   = require('zod');

const db        = require('../db');
const ai        = require('../services/ai');
const { getSignedUrl } = require('../services/storage');
const { calculateTransformationScore, evaluateAchievements } = require('../services/scoring');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError, AppError, ForbiddenError } = require('../utils/errors');
const logger    = require('../utils/logger');

const MILESTONE_DAYS = new Set([1, 7, 14, 21]);
const CRISIS_RESPONSE = {
  crisis: true,
  message: "I can hear that something difficult is happening right now. Please know you're not alone.",
  resources: [
    { name: 'iCall', number: '9152987821' },
    { name: 'Vandrevala Foundation', number: '1860-2662-345' },
  ],
};

// Rotating question keys (used on non-milestone days)
const ROTATING_QUESTIONS = ['resistance', 'identity', 'doubt', 'believability'];

/** Verify journey belongs to user and is active */
async function getActiveJourney(journeyId, userId) {
  const { rows } = await db.query(
    `SELECT * FROM journeys WHERE id = $1 AND user_id = $2 AND status = 'active'`,
    [journeyId, userId]
  );
  if (rows.length === 0) throw new NotFoundError('Active journey');
  return rows[0];
}

/** Sync calendar days and run auto-unlock check */
async function syncAndAutoUnlock(journeyId) {
  const { rows: [journey] } = await db.query(
    `SELECT calendar_started_at, current_affirmation_day FROM journeys WHERE id = $1`,
    [journeyId]
  );
  if (!journey.calendar_started_at) return;

  const calendarDays = Math.floor(
    (Date.now() - new Date(journey.calendar_started_at).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  await db.query(
    'UPDATE journeys SET current_calendar_day = $1, updated_at = NOW() WHERE id = $2',
    [calendarDays, journeyId]
  );

  // Auto-unlock: find sessions older than 24h that aren't completed
  const { rows: staleSessions } = await db.query(
    `SELECT id, affirmation_day_number FROM daily_sessions
     WHERE journey_id = $1
       AND state NOT IN ('completed', 'expired', 'locked')
       AND created_at < NOW() - INTERVAL '24 hours'`,
    [journeyId]
  );

  for (const session of staleSessions) {
    await db.query(
      `UPDATE daily_sessions SET state = 'expired', auto_unlocked_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    // Unlock next day if it exists and isn't already unlocked
    const nextDay = session.affirmation_day_number + 1;
    if (nextDay <= 21) {
      const { rows: nextSession } = await db.query(
        `SELECT id, state FROM daily_sessions
         WHERE journey_id = $1 AND affirmation_day_number = $2`,
        [journeyId, nextDay]
      );
      if (nextSession.length > 0 && nextSession[0].state === 'locked') {
        await db.query(
          `UPDATE daily_sessions
           SET state = 'morning_unlocked', auto_unlocked_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [nextSession[0].id]
        );
      } else if (nextSession.length === 0) {
        // Create session for next day
        await db.query(
          `INSERT INTO daily_sessions (journey_id, affirmation_day_number, calendar_date, state)
           VALUES ($1, $2, CURRENT_DATE, 'morning_unlocked')
           ON CONFLICT (journey_id, affirmation_day_number) DO NOTHING`,
          [journeyId, nextDay]
        );
      }
    }

    logger.info({ journeyId, day: session.affirmation_day_number }, 'Auto-unlock triggered');
  }
}

// ── GET /api/journey/current ─────────────────────────────────
router.get('/current', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { rows: journeys } = await db.query(
      `SELECT id, track, tier, status, current_affirmation_day, current_calendar_day,
              transformation_score, calendar_started_at
       FROM journeys WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (journeys.length === 0) {
      // Check for generating journey
      const { rows: gen } = await db.query(
        `SELECT id, status FROM journeys WHERE user_id = $1 AND status = 'generating'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (gen.length > 0) return res.json({ journey_id: gen[0].id, status: 'generating' });
      return res.json({ status: 'no_active_journey' });
    }

    const journey = journeys[0];
    await syncAndAutoUnlock(journey.id);

    // Re-fetch after sync
    const { rows: [updated] } = await db.query(
      'SELECT current_affirmation_day, current_calendar_day, transformation_score FROM journeys WHERE id = $1',
      [journey.id]
    );

    res.json({
      journey_id:              journey.id,
      track:                   journey.track,
      tier:                    journey.tier,
      status:                  journey.status,
      current_affirmation_day: updated.current_affirmation_day,
      current_calendar_day:    updated.current_calendar_day,
      transformation_score:    updated.transformation_score,
    });
  } catch (err) { next(err); }
});

// ── GET /api/journey/:journey_id/day/:day_number ─────────────
router.get('/:journey_id/day/:day_number', requireAuth, async (req, res, next) => {
  try {
    const { journey_id, day_number } = req.params;
    const day = parseInt(day_number, 10);
    if (isNaN(day) || day < 1 || day > 21) throw new AppError('Day must be 1–21', 400, 'INVALID_DAY');

    await getActiveJourney(journey_id, req.user.userId);

    // Get affirmation content
    const { rows: [affDay] } = await db.query(
      `SELECT * FROM affirmation_days WHERE journey_id = $1 AND day_number = $2`,
      [journey_id, day]
    );
    if (!affDay) throw new NotFoundError('Affirmation day');

    // Get session state
    const { rows: [session] } = await db.query(
      `SELECT * FROM daily_sessions WHERE journey_id = $1 AND affirmation_day_number = $2`,
      [journey_id, day]
    );

    const state = session?.state || 'locked';

    if (state === 'locked') {
      return res.json({ day_number: day, state: 'locked' });
    }

    // Generate signed URLs based on what's unlocked
    const urls = {};
    if (affDay.morning_audio_path) {
      urls.morning_audio_url  = await getSignedUrl(affDay.morning_audio_path);
    }
    if (affDay.infographic_path) {
      urls.infographic_url    = await getSignedUrl(affDay.infographic_path);
    }
    if (['evening_unlocked', 'checkin_unlocked', 'completed'].includes(state) && affDay.evening_audio_path) {
      urls.evening_audio_url  = await getSignedUrl(affDay.evening_audio_path);
    }

    // Is check-in complete?
    const { rows: [checkin] } = await db.query(
      `SELECT believability_score, doubt_score, action_completed
       FROM check_ins WHERE daily_session_id = $1`,
      [session?.id]
    );

    // Determine rotating question for today (if non-milestone)
    const isMilestone = MILESTONE_DAYS.has(day);
    let rotatingQuestion = null;
    if (!isMilestone && state === 'checkin_unlocked') {
      // Deterministically pick question based on day number to cycle through them
      const qKey = ROTATING_QUESTIONS[(day - 1) % ROTATING_QUESTIONS.length];
      rotatingQuestion = qKey;
    }

    res.json({
      day_number:         day,
      state,
      doubt:              affDay.doubt,
      reframe:            affDay.reframe,
      truth_statement:    affDay.truth_statement,
      action_prompt:      affDay.action_prompt,
      is_milestone_day:   isMilestone,
      rotating_question:  rotatingQuestion,
      morning_completed:  !!session?.morning_completed_at,
      evening_completed:  !!session?.evening_completed_at,
      checkin_completed:  !!session?.checkin_completed_at,
      checkin_data:       checkin || null,
      progress_card_url:  session?.progress_card_url || null,
      ...urls,
    });
  } catch (err) { next(err); }
});

// ── POST /api/journey/:journey_id/day/:day_number/morning-complete
router.post('/:journey_id/day/:day_number/morning-complete', requireAuth, async (req, res, next) => {
  try {
    const { journey_id, day_number } = req.params;
    const day = parseInt(day_number, 10);
    await getActiveJourney(journey_id, req.user.userId);

    // Upsert session row
    await db.query(
      `INSERT INTO daily_sessions (journey_id, affirmation_day_number, calendar_date, state, morning_started_at, morning_completed_at)
       VALUES ($1, $2, CURRENT_DATE, 'evening_unlocked', COALESCE((SELECT morning_started_at FROM daily_sessions WHERE journey_id = $1 AND affirmation_day_number = $2), NOW()), NOW())
       ON CONFLICT (journey_id, affirmation_day_number)
       DO UPDATE SET
         state = CASE WHEN daily_sessions.state IN ('morning_unlocked', 'locked') THEN 'evening_unlocked' ELSE daily_sessions.state END,
         morning_completed_at = COALESCE(daily_sessions.morning_completed_at, NOW()),
         updated_at = NOW()`,
      [journey_id, day]
    );

    res.json({ state: 'evening_unlocked', day_number: day });
  } catch (err) { next(err); }
});

// ── POST /api/journey/:journey_id/day/:day_number/evening-complete
router.post('/:journey_id/day/:day_number/evening-complete', requireAuth, async (req, res, next) => {
  try {
    const { journey_id, day_number } = req.params;
    const day = parseInt(day_number, 10);
    await getActiveJourney(journey_id, req.user.userId);

    const { rows: [session] } = await db.query(
      `SELECT id, state FROM daily_sessions WHERE journey_id = $1 AND affirmation_day_number = $2`,
      [journey_id, day]
    );
    if (!session || !['evening_unlocked', 'morning_unlocked'].includes(session.state)) {
      throw new AppError('Evening not yet unlocked for this day', 400, 'NOT_UNLOCKED');
    }

    await db.query(
      `UPDATE daily_sessions
       SET state = 'checkin_unlocked', evening_completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    res.json({ state: 'checkin_unlocked', day_number: day });
  } catch (err) { next(err); }
});

// ── POST /api/journey/:journey_id/day/:day_number/checkin ────
const checkinSchema = z.object({
  believability_score:    z.number().int().min(1).max(10),
  doubt_score:            z.number().int().min(1).max(10).optional(),
  resistance_score:       z.number().int().min(1).max(10).optional(),
  identity_score:         z.number().int().min(1).max(10).optional(),
  action_completed:       z.enum(['yes', 'partially', 'no']).optional(),
  evidence_text:          z.string().max(1000).optional(),
  rotating_question_key:  z.string().optional(),
  rotating_question_score: z.number().int().min(1).max(10).optional(),
});

router.post('/:journey_id/day/:day_number/checkin', requireAuth, async (req, res, next) => {
  try {
    const { journey_id, day_number } = req.params;
    const day  = parseInt(day_number, 10);
    const body = checkinSchema.parse(req.body);
    const isMilestone = MILESTONE_DAYS.has(day);

    // Validate milestone fields
    if (isMilestone) {
      if (!body.doubt_score || !body.resistance_score || !body.identity_score || !body.action_completed) {
        throw new AppError('Milestone check-in requires: doubt_score, resistance_score, identity_score, action_completed', 400, 'INCOMPLETE_CHECKIN');
      }
    }

    await getActiveJourney(journey_id, req.user.userId);

    const { rows: [session] } = await db.query(
      `SELECT id, state FROM daily_sessions WHERE journey_id = $1 AND affirmation_day_number = $2`,
      [journey_id, day]
    );
    if (!session || session.state !== 'checkin_unlocked') {
      throw new AppError('Check-in not yet available for this day', 400, 'NOT_UNLOCKED');
    }

    // Crisis detection on evidence text
    if (body.evidence_text) {
      const crisis = await ai.detectCrisis(body.evidence_text);
      if (crisis.crisis_detected) {
        await db.query(
          `INSERT INTO crisis_events (user_id, journey_id, trigger_context, crisis_type, resources_shown)
           VALUES ($1, $2, 'checkin', $3, $4)`,
          [req.user.userId, journey_id, crisis.crisis_type, JSON.stringify(CRISIS_RESPONSE.resources)]
        );
        return res.json(CRISIS_RESPONSE);
      }
    }

    // Save check-in
    await db.query(
      `INSERT INTO check_ins (daily_session_id, journey_id, affirmation_day_number, is_milestone_day,
         believability_score, doubt_score, resistance_score, identity_score,
         action_completed, evidence_text, rotating_question_key, rotating_question_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [session.id, journey_id, day, isMilestone,
       body.believability_score, body.doubt_score || null, body.resistance_score || null, body.identity_score || null,
       body.action_completed || null, body.evidence_text || null,
       body.rotating_question_key || null, body.rotating_question_score || null]
    );

    // Calculate updated Transformation Score
    const score = await calculateTransformationScore(journey_id);

    // Update check-in record with score
    await db.query(
      `UPDATE check_ins SET transformation_score = $1
       WHERE daily_session_id = $2 AND affirmation_day_number = $3`,
      [score, session.id, day]
    );

    // Mark session complete and increment affirmation day counter
    await db.query(
      `UPDATE daily_sessions
       SET state = 'completed', checkin_completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    await db.query(
      `UPDATE journeys
       SET current_affirmation_day = $1, transformation_score = $2, updated_at = NOW()
       WHERE id = $3`,
      [day, score, journey_id]
    );

    // Unlock next day (if within 21)
    let nextDayUnlocked = false;
    if (day < 21) {
      await db.query(
        `INSERT INTO daily_sessions (journey_id, affirmation_day_number, calendar_date, state)
         VALUES ($1, $2, CURRENT_DATE, 'morning_unlocked')
         ON CONFLICT (journey_id, affirmation_day_number) DO UPDATE SET state = 'morning_unlocked', updated_at = NOW()`,
        [journey_id, day + 1]
      );
      nextDayUnlocked = true;
    } else {
      // Day 21 complete — mark journey completed
      await db.query(
        `UPDATE journeys SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [journey_id]
      );
    }

    // Evaluate achievements
    const newBadges = await evaluateAchievements(journey_id);
    if (newBadges.length > 0) {
      const badgeValues = newBadges.map(b => `('${req.user.userId}', '${journey_id}', '${b}')`).join(',');
      await db.query(
        `INSERT INTO achievements (user_id, journey_id, badge_type) VALUES ${badgeValues} ON CONFLICT DO NOTHING`
      );
      logger.info({ journey_id, newBadges }, 'Achievements earned');
    }

    // ── Bannerbear: generate progress card + badge cards (async — don't await) ──
    setImmediate(async () => {
      try {
        const bannerbear = require('../services/bannerbear');

        // Fetch user name + journey track for card generation
        const { rows: [jRow] } = await db.query(
          `SELECT j.track, j.current_calendar_day, u.name FROM journeys j JOIN users u ON u.id = j.user_id WHERE j.id = $1`,
          [journey_id]
        );

        if (jRow) {
          // Progress card for completed day
          const progressUrl = await bannerbear.generateProgressCard({
            journey_id,
            day_number:           day,
            calendar_day:         jRow.current_calendar_day || day,
            user_name:            jRow.name,
            transformation_score: score,
            believability_score:  body.believability_score || 5,
            track:                jRow.track,
          });

          await db.query(
            `UPDATE daily_sessions SET progress_card_url = $1, updated_at = NOW()
             WHERE id = $2`,
            [progressUrl, session.id]
          );

          logger.info({ journey_id, day, progressUrl }, 'Progress card generated');

          // Badge cards for any new achievements
          for (const badgeType of newBadges) {
            try {
              const badgeUrl = await bannerbear.generateBadgeCard({
                journey_id,
                badge_type: badgeType,
                user_name:  jRow.name,
                track:      jRow.track,
              });
              await db.query(
                `UPDATE achievements SET card_path = $1
                 WHERE journey_id = $2 AND badge_type = $3`,
                [badgeUrl, journey_id, badgeType]
              );
              logger.info({ journey_id, badgeType, badgeUrl }, 'Badge card generated');
            } catch (badgeErr) {
              logger.error({ err: badgeErr.message, journey_id, badgeType }, 'Badge card generation failed');
            }
          }
        }
      } catch (err) {
        logger.error({ err: err.message, journey_id, day }, 'Bannerbear post-checkin generation failed');
      }
    });

    // Fire n8n day-complete webhook (async — don't await)
    const axios = require('axios');
    if (process.env.N8N_WEBHOOK_URL_DAY_COMPLETE) {
      axios.post(process.env.N8N_WEBHOOK_URL_DAY_COMPLETE, {
        journey_id,
        user_id:    req.user.userId,
        day_number: day,
        score_before: null, // could store previous score
      }, {
        headers: { 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET },
        timeout: 5000,
      }).catch(err => logger.error({ err }, 'n8n day-complete webhook failed'));
    }

    res.json({
      transformation_score: score,
      next_day_unlocked:    nextDayUnlocked,
      new_badges:           newBadges,
      journey_completed:    day === 21,
    });
  } catch (err) { next(err); }
});

// ── POST /api/journey/:journey_id/day/:day_number/report ─────
// Cultural sensitivity flag — user reports an affirmation as inappropriate
router.post('/:journey_id/day/:day_number/report', requireAuth, async (req, res, next) => {
  try {
    const { journey_id, day_number } = req.params;
    const day = parseInt(day_number, 10);
    if (isNaN(day) || day < 1 || day > 21) throw new AppError('Day must be 1–21', 400, 'INVALID_DAY');

    // Verify journey ownership (allow any status — user may have just completed)
    const { rows } = await db.query(
      `SELECT id FROM journeys WHERE id = $1 AND user_id = $2`,
      [journey_id, req.user.userId]
    );
    if (rows.length === 0) throw new NotFoundError('Journey');

    // Log the report — stored in crisis_events table for admin review
    await db.query(
      `INSERT INTO crisis_events
         (user_id, journey_id, crisis_type, trigger_context, resources_shown, reviewed)
       VALUES ($1, $2, 'content_report', $3, '[]', false)`,
      [req.user.userId, journey_id, `Day ${day} affirmation flagged as culturally insensitive`]
    );

    logger.info({ journey_id, day, userId: req.user.userId }, 'Affirmation reported as culturally insensitive');
    res.json({ success: true, message: 'Thank you — our team will review this affirmation.' });
  } catch (err) { next(err); }
});

// ── GET /api/journey/:journey_id/generation-status ───────────
router.get('/:journey_id/generation-status', requireAuth, async (req, res, next) => {
  try {
    const { journey_id } = req.params;

    // Verify ownership (any status for generating journey)
    const { rows } = await db.query(
      `SELECT status FROM journeys WHERE id = $1 AND user_id = $2`,
      [journey_id, req.user.userId]
    );
    if (rows.length === 0) throw new NotFoundError('Journey');

    const { rows: jobs } = await db.query(
      `SELECT job_type, status, COUNT(*) as count
       FROM content_generation_jobs WHERE journey_id = $1
       GROUP BY job_type, status`,
      [journey_id]
    );

    const total     = jobs.reduce((s, j) => s + parseInt(j.count), 0);
    const completed = jobs.filter(j => j.status === 'completed').reduce((s, j) => s + parseInt(j.count), 0);
    const failed    = jobs.filter(j => j.status === 'failed').reduce((s, j) => s + parseInt(j.count), 0);

    res.json({
      journey_status: rows[0].status,
      jobs: { total, completed, failed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 },
    });
  } catch (err) { next(err); }
});

module.exports = router;
