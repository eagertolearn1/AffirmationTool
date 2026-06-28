/**
 * Progress Routes
 * Dashboard data, transformation score history, streak info.
 */
const express = require('express');
const db      = require('../db');
const scoring = require('../services/scoring');
const storage = require('../services/storage');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────
// GET /api/progress/:journey_id/dashboard
// Full dashboard: score, streak, completed days, recent sessions
// ─────────────────────────────────────────────────────────────
router.get('/:journey_id/dashboard', async (req, res, next) => {
  try {
    const journey = await getJourneyForUser(req.params.journey_id, req.user.userId);

    // Transformation score
    const score = await scoring.calculateTransformationScore(journey.id);

    // Completed sessions
    const { rows: sessions } = await db.query(
      `SELECT
         ds.affirmation_day_number,
         ds.calendar_date,
         ds.state,
         ci.doubt_score,
         ci.believability_score,
         ci.action_completed,
         ci.evidence_text,
         ad.truth_statement
       FROM daily_sessions ds
       LEFT JOIN check_ins ci ON ci.daily_session_id = ds.id
       LEFT JOIN affirmation_days ad ON ad.journey_id = ds.journey_id AND ad.day_number = ds.affirmation_day_number
       WHERE ds.journey_id = $1
       ORDER BY ds.affirmation_day_number DESC
       LIMIT 21`,
      [journey.id]
    );

    // Streak: consecutive completed days ending today
    const streak = computeStreak(sessions);

    // Score history (last 10 completed check-ins)
    const scoreHistory = sessions
      .filter(s => s.believability_score != null)
      .slice(0, 10)
      .reverse()
      .map(s => ({
        day:                 s.affirmation_day_number,
        believability_score: s.believability_score,
        doubt_score:         s.doubt_score,
        action_completed:    s.action_completed,
      }));

    res.json({
      journey: {
        id:                   journey.id,
        track:                journey.track,
        status:               journey.status,
        affirmation_day:      journey.current_affirmation_day,
        calendar_day:         journey.current_calendar_day,
        transformation_score: score,
        streak,
      },
      score_history: scoreHistory,
      recent_sessions: sessions.slice(0, 7),
    });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// GET /api/progress/:journey_id/score
// Current transformation score + breakdown
// ─────────────────────────────────────────────────────────────
router.get('/:journey_id/score', async (req, res, next) => {
  try {
    const journey = await getJourneyForUser(req.params.journey_id, req.user.userId);
    const score   = await scoring.calculateTransformationScore(journey.id);
    res.json({ transformation_score: score });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// GET /api/progress/:journey_id/sessions
// All sessions with check-in data
// ─────────────────────────────────────────────────────────────
router.get('/:journey_id/sessions', async (req, res, next) => {
  try {
    const journey = await getJourneyForUser(req.params.journey_id, req.user.userId);

    const { rows } = await db.query(
      `SELECT
         ds.id,
         ds.affirmation_day_number AS day,
         ds.calendar_date,
         ds.state,
         ci.doubt_score,
         ci.believability_score,
         ci.action_completed,
         ci.evidence_text,
         ds.progress_card_url,
         ds.checkin_completed_at
       FROM daily_sessions ds
       LEFT JOIN check_ins ci ON ci.daily_session_id = ds.id
       WHERE ds.journey_id = $1
       ORDER BY ds.affirmation_day_number`,
      [journey.id]
    );

    // Attach signed URL for progress cards if stored as a path
    const sessionsWithUrls = await Promise.all(rows.map(async (s) => {
      if (s.progress_card_url && !s.progress_card_url.startsWith('http')) {
        s.progress_card_url = await storage.getSignedUrl(s.progress_card_url);
      }
      return s;
    }));

    res.json({ sessions: sessionsWithUrls });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function getJourneyForUser(journeyId, userId) {
  const { rows: [j] } = await db.query(
    'SELECT * FROM journeys WHERE id = $1 AND user_id = $2',
    [journeyId, userId]
  );
  if (!j) throw new NotFoundError('Journey not found');
  return j;
}

function computeStreak(sessions) {
  const completedDays = sessions
    .filter(s => s.state === 'completed')
    .map(s => s.calendar_date.toISOString().split('T')[0])
    .sort()
    .reverse();

  if (!completedDays.length) return 0;

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (completedDays[0] !== today && completedDays[0] !== yesterday) return 0;

  let streak  = 0;
  let current = new Date(completedDays[0]);
  for (const dateStr of completedDays) {
    const d = new Date(dateStr);
    const diff = Math.round((current - d) / 86400000);
    if (diff > 1) break;
    streak++;
    current = d;
  }
  return streak;
}

module.exports = router;
