const db = require('../db');

/**
 * Calculate Transformation Score for a journey.
 *
 * Score = (consistency × 0.35 + believability_trend × 0.25 +
 *           doubt_reduction × 0.25 + action_completion × 0.15) × 100
 *
 * @returns {number} 0–100
 */
async function calculateTransformationScore(journeyId) {
  // 1. Consistency rate: completed sessions / calendar days elapsed
  const { rows: sessionRows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE state = 'completed') AS completed_days,
       COUNT(*) FILTER (WHERE state = 'expired')   AS expired_days,
       COUNT(*) AS total_sessions
     FROM daily_sessions WHERE journey_id = $1`,
    [journeyId]
  );
  const { completed_days, total_sessions } = sessionRows[0];
  const consistencyRate = total_sessions > 0
    ? parseFloat(completed_days) / parseFloat(total_sessions)
    : 0;

  // 2. Check-in data for trends
  const { rows: checkins } = await db.query(
    `SELECT believability_score, doubt_score, action_completed,
            affirmation_day_number, is_milestone_day
     FROM check_ins
     WHERE journey_id = $1
     ORDER BY affirmation_day_number ASC`,
    [journeyId]
  );

  if (checkins.length === 0) {
    return Math.round(consistencyRate * 35); // only consistency available
  }

  const first = checkins[0];
  const last  = checkins[checkins.length - 1];

  // 3. Believability trend: current / day1 (capped at 1.0)
  const believabilityTrend = first.believability_score > 0
    ? Math.min(1, (last.believability_score || first.believability_score) / first.believability_score)
    : 0;

  // 4. Doubt reduction: (10 - current) / (10 - day1) (capped at 1.0)
  const doubtBase    = first.doubt_score;
  const doubtCurrent = last.doubt_score;
  let doubtReduction = 0;
  if (doubtBase !== null && doubtBase < 10) {
    doubtReduction = Math.min(1, (10 - (doubtCurrent || doubtBase)) / (10 - doubtBase));
  }

  // 5. Action completion: milestone days only
  const milestones = checkins.filter(c => c.is_milestone_day && c.action_completed);
  let actionScore = 0;
  if (milestones.length > 0) {
    const points = milestones.reduce((sum, c) => {
      if (c.action_completed === 'yes')       return sum + 1;
      if (c.action_completed === 'partially') return sum + 0.5;
      return sum;
    }, 0);
    actionScore = points / milestones.length;
  }

  const score = Math.round(
    (consistencyRate  * 0.35 +
     believabilityTrend * 0.25 +
     doubtReduction    * 0.25 +
     actionScore       * 0.15) * 100
  );

  return Math.max(0, Math.min(100, score));
}

/**
 * Evaluate which achievement badges a journey has earned.
 * Returns array of badge_type strings newly earned (not already in DB).
 */
async function evaluateAchievements(journeyId) {
  const { rows: journey } = await db.query(
    `SELECT current_affirmation_day, current_calendar_day, calendar_started_at
     FROM journeys WHERE id = $1`,
    [journeyId]
  );
  if (journey.length === 0) return [];
  const j = journey[0];

  const { rows: sessions } = await db.query(
    `SELECT affirmation_day_number, state, created_at
     FROM daily_sessions WHERE journey_id = $1
     ORDER BY affirmation_day_number ASC`,
    [journeyId]
  );

  const { rows: existingBadges } = await db.query(
    'SELECT badge_type FROM achievements WHERE journey_id = $1',
    [journeyId]
  );
  const alreadyEarned = new Set(existingBadges.map(b => b.badge_type));

  const newBadges = [];

  // Journey Completer: all 21 affirmation days completed
  if (j.current_affirmation_day >= 21 && !alreadyEarned.has('journey_completer')) {
    const allDone = sessions.filter(s => s.state === 'completed').length >= 21;
    if (allDone) newBadges.push('journey_completer');
  }

  // Perfect Consistency: affirmation days = calendar days = 21
  if (j.current_affirmation_day >= 21 && j.current_calendar_day <= 21 && !alreadyEarned.has('perfect_consistency')) {
    const completed = sessions.filter(s => s.state === 'completed').length;
    if (completed === 21 && j.current_calendar_day === 21) {
      newBadges.push('perfect_consistency');
    }
  }

  // Strong Momentum: Days 1–14 completed without any gap/expired
  if (j.current_affirmation_day >= 14 && !alreadyEarned.has('strong_momentum')) {
    const first14 = sessions.filter(s => s.affirmation_day_number <= 14);
    const noGaps  = first14.every(s => s.state === 'completed');
    if (first14.length === 14 && noGaps) newBadges.push('strong_momentum');
  }

  // Comeback Champion: had a gap (expired session) AND still completed all 21
  if (j.current_affirmation_day >= 21 && !alreadyEarned.has('comeback_champion')) {
    const hadExpired  = sessions.some(s => s.state === 'expired');
    const completed21 = sessions.filter(s => s.state === 'completed').length >= 21;
    if (hadExpired && completed21) newBadges.push('comeback_champion');
  }

  // Action Taker: ≥80% action completion on milestone check-ins
  if (!alreadyEarned.has('action_taker')) {
    const { rows: milestones } = await db.query(
      `SELECT action_completed FROM check_ins
       WHERE journey_id = $1 AND is_milestone_day = true AND action_completed IS NOT NULL`,
      [journeyId]
    );
    if (milestones.length >= 2) { // At least 2 milestone check-ins to evaluate
      const yes = milestones.filter(m => m.action_completed === 'yes').length;
      const partial = milestones.filter(m => m.action_completed === 'partially').length;
      const rate = (yes + partial * 0.5) / milestones.length;
      if (rate >= 0.8) newBadges.push('action_taker');
    }
  }

  return newBadges;
}

module.exports = { calculateTransformationScore, evaluateAchievements };
