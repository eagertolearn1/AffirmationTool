/**
 * Admin Routes — Business metrics, crisis event queue
 * All routes require requireAdmin middleware.
 */
const express = require('express');
const db      = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// ─────────────────────────────────────────────────────────────
// POST /api/admin/journeys/:id/generate-content
// Trigger full 21-day affirmation content generation for a journey.
// ─────────────────────────────────────────────────────────────
router.post('/journeys/:id/generate-content', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: [journey] } = await db.query(
      `SELECT id, track, language, tier, status,
              problem_statement, goal_statement,
              inner_voice_belief, identity_shift_needed, core_belief_to_change,
              calibration_data, voice_clone_id, music_style
       FROM journeys WHERE id = $1`,
      [id]
    );
    if (!journey) return res.status(404).json({ error: 'Journey not found' });

    // Enqueue job in affirmationQueue
    const { affirmationQueue } = require('../workers/index');
    const job = await affirmationQueue.add('generate-affirmations', {
      journey_id:           id,
      track:                journey.track,
      language:             journey.language || 'en',
      tier:                 journey.tier,
      problem_statement:    journey.problem_statement,
      goal_statement:       journey.goal_statement,
      inner_voice_belief:   journey.inner_voice_belief,
      identity_shift_needed:journey.identity_shift_needed,
      core_belief_to_change:journey.core_belief_to_change,
      calibration_data:     journey.calibration_data,
      voice_clone_id:       journey.voice_clone_id,
      music_style:          journey.music_style,
    }, { attempts: 3, backoff: { type: 'exponential', delay: 10000 } });

    // Update journey status to generating
    await db.query(
      `UPDATE journeys SET status = 'generating', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    logger.info({ journeyId: id, jobId: job.id, adminEmail: req.user.email }, 'Content generation enqueued (admin)');
    res.json({ success: true, job_id: job.id, message: 'Content generation enqueued. Check generation-status endpoint for progress.' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/journeys/:id/generate-all-audio
// Full pipeline: 2-3 min script → TTS HD → FFmpeg mix → R2 upload
// Also generates Bannerbear infographic for each day.
// Query params: from_day, to_day, skip_audio, skip_infographic, force (regenerate existing)
// ─────────────────────────────────────────────────────────────
router.post('/journeys/:id/generate-all-audio', async (req, res, next) => {
  try {
    const { id } = req.params;
    const from_day        = parseInt(req.query.from_day || '1', 10);
    const to_day          = parseInt(req.query.to_day   || '21', 10);
    const skipAudio       = req.query.skip_audio       === 'true';
    const skipInfographic = req.query.skip_infographic === 'true';
    const force           = req.query.force            === 'true';

    // Respond immediately — generation runs in background (takes 15-25 min for 21 days)
    res.json({ accepted: true, message: `Generation started for days ${from_day}–${to_day}. Check backend logs for progress.` });

    const tts        = require('../services/tts');
    const storage    = require('../services/storage');
    const bannerbear = require('../services/bannerbear');
    const ai         = require('../services/ai');

    // Fetch journey metadata including fields needed for content generation
    const { rows: [journey] } = await db.query(
      `SELECT j.track, j.language, j.tier, j.music_style,
              j.problem_statement, j.goal_statement,
              j.inner_voice_belief, j.identity_shift_needed, j.core_belief_to_change,
              j.calibration_data,
              u.name AS user_name
       FROM journeys j JOIN users u ON u.id = j.user_id WHERE j.id = $1`,
      [id]
    );
    if (!journey) { logger.error({ journeyId: id }, 'Journey not found for generate-all-audio'); return; }

    // ── Auto-generate missing content ─────────────────────────
    const { rows: allDays } = await db.query(
      `SELECT day_number, truth_statement FROM affirmation_days WHERE journey_id = $1 ORDER BY day_number`,
      [id]
    );
    const daysWithContent = new Set(allDays.filter(d => d.truth_statement && d.truth_statement.trim().length > 5).map(d => d.day_number));
    const missingDays = [];
    for (let d = from_day; d <= to_day; d++) { if (!daysWithContent.has(d)) missingDays.push(d); }

    if (missingDays.length > 0) {
      logger.info({ journeyId: id, missingDays }, 'Content missing — generating via AI before audio');
      try {
        const generatedDays = await ai.generateAffirmationArc({
          track:                 journey.track || 'confidence',
          language:              journey.language || 'en',
          problem_statement:     journey.problem_statement || 'I struggle with self-doubt',
          goal_statement:        journey.goal_statement    || 'I want to feel genuinely confident',
          inner_voice_belief:    journey.inner_voice_belief || 'I am not good enough',
          identity_shift_needed: journey.identity_shift_needed || 'From doubter to confident leader',
          core_belief_to_change: journey.core_belief_to_change || 'I am not enough',
          calibration_data:      journey.calibration_data || {},
        });
        for (const day of generatedDays) {
          if (!missingDays.includes(day.day_number)) continue;
          await db.query(
            `INSERT INTO affirmation_days
               (journey_id, day_number, doubt, reframe, truth_statement, action_prompt, content_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'ready')
             ON CONFLICT (journey_id, day_number)
             DO UPDATE SET doubt=$3, reframe=$4, truth_statement=$5, action_prompt=$6, content_status='ready', updated_at=NOW()`,
            [id, day.day_number, day.doubt, day.reframe, day.truth_statement, day.action_prompt]
          );
        }
        logger.info({ journeyId: id, count: missingDays.length }, 'Content generated for missing days');
      } catch (contentErr) {
        logger.error({ err: contentErr.message, journeyId: id }, 'Content generation failed — audio will skip days without content');
      }
    }

    const results = [];

    for (let dayNum = from_day; dayNum <= to_day; dayNum++) {
      const { rows: [affDay] } = await db.query(
        `SELECT day_number, doubt, reframe, truth_statement, action_prompt,
                morning_audio_path, evening_audio_path, audio_status,
                infographic_path, infographic_status
         FROM affirmation_days WHERE journey_id = $1 AND day_number = $2`,
        [id, dayNum]
      );

      if (!affDay || !affDay.truth_statement) {
        results.push({ day: dayNum, status: 'skipped', reason: 'no content' });
        logger.warn({ journeyId: id, day: dayNum }, 'Day skipped — still no content after generation attempt');
        continue;
      }

      const dayResult = { day: dayNum, audio: null, infographic: null };
      const dayContent = {
        day_number:      dayNum,
        doubt:           affDay.doubt,
        reframe:         affDay.reframe,
        truth_statement: affDay.truth_statement,
        action_prompt:   affDay.action_prompt,
      };

      // ── Audio ──────────────────────────────────────────────
      if (!skipAudio) {
        const audioExists = affDay.morning_audio_path && affDay.evening_audio_path && affDay.audio_status === 'ready';
        if (audioExists && !force) {
          dayResult.audio = 'skipped (exists)';
        } else {
          const audioErrors = [];
          let morningPath = null;
          let eveningPath = null;

          try {
            const buf = await tts.generateFullAudio(
              dayContent,
              journey.language || 'en',
              'energizing',
              journey.music_style || 'calm',
              journey.track || 'confidence'
            );
            morningPath = storage.assetPath(id, dayNum, 'morning.mp3');
            await storage.uploadFile(morningPath, buf, 'audio/mpeg');
          } catch (e) { audioErrors.push(`morning: ${e.message}`); }

          try {
            const buf = await tts.generateFullAudio(
              dayContent,
              journey.language || 'en',
              'calming',
              journey.music_style || 'calm',
              journey.track || 'confidence'
            );
            eveningPath = storage.assetPath(id, dayNum, 'evening.mp3');
            await storage.uploadFile(eveningPath, buf, 'audio/mpeg');
          } catch (e) { audioErrors.push(`evening: ${e.message}`); }

          await db.query(
            `UPDATE affirmation_days
             SET morning_audio_path = COALESCE($1, morning_audio_path),
                 evening_audio_path = COALESCE($2, evening_audio_path),
                 audio_status = CASE WHEN $1 IS NOT NULL AND $2 IS NOT NULL THEN 'ready'::generation_status ELSE audio_status END,
                 updated_at = NOW()
             WHERE journey_id = $3 AND day_number = $4`,
            [morningPath, eveningPath, id, dayNum]
          );

          dayResult.audio = audioErrors.length ? { errors: audioErrors } : 'generated';
          logger.info({ journeyId: id, day: dayNum }, 'Full audio generated');
        }
      }

      // ── Infographic ────────────────────────────────────────
      if (!skipInfographic) {
        const infographicExists = affDay.infographic_path && affDay.infographic_status === 'ready';
        if (infographicExists && !force) {
          dayResult.infographic = 'skipped (exists)';
        } else {
          try {
            const imageUrl = await bannerbear.generateInfographic({
              journey_id:      id,
              day_number:      dayNum,
              track:           journey.track,
              doubt:           affDay.doubt,
              reframe:         affDay.reframe,
              truth_statement: affDay.truth_statement,
              action_prompt:   affDay.action_prompt,
              user_name:       journey.user_name,
            });
            await db.query(
              `UPDATE affirmation_days SET infographic_path = $1, infographic_status = 'ready'::generation_status, updated_at = NOW()
               WHERE journey_id = $2 AND day_number = $3`,
              [imageUrl, id, dayNum]
            );
            dayResult.infographic = 'generated';
            logger.info({ journeyId: id, day: dayNum, imageUrl }, 'Infographic generated');
          } catch (e) {
            dayResult.infographic = { error: e.message };
            logger.error({ err: e.message, journeyId: id, day: dayNum }, 'Infographic failed');
          }
        }
      }

      results.push(dayResult);

      // Brief pause to avoid hitting rate limits across back-to-back calls
      await new Promise(r => setTimeout(r, 500));
    }

    logger.info({ journeyId: id, results }, 'generate-all-audio complete');
    // Response already sent above — do not call res.json() again
  } catch (err) {
    // Can't send HTTP error — response already sent. Just log it.
    logger.error({ err }, 'generate-all-audio background error');
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/metrics
// Business dashboard: signups, active journeys, completions, revenue
// ─────────────────────────────────────────────────────────────
router.get('/metrics', async (req, res, next) => {
  try {
    const [
      { rows: [users] },
      { rows: [journeys] },
      { rows: [revenue] },
      { rows: retention },
    ] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)                                        AS total_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_30d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS new_7d,
          COUNT(*) FILTER (WHERE subscription_tier = 'premium')            AS premium_count,
          COUNT(*) FILTER (WHERE is_deleted = true)                        AS deleted_count
        FROM users
      `),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')     AS active,
          COUNT(*) FILTER (WHERE status = 'completed')  AS completed,
          COUNT(*) FILTER (WHERE status = 'generating') AS generating,
          COUNT(*) FILTER (WHERE status = 'onboarding') AS onboarding,
          ROUND(AVG(current_affirmation_day) FILTER (WHERE status = 'active'), 1) AS avg_day,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'completed') /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'renewed')), 0), 1
          ) AS completion_rate_pct
        FROM journeys
      `),
      db.query(`
        SELECT
          SUM(amount_paise) FILTER (WHERE status = 'completed')                             AS total_paise,
          SUM(amount_paise) FILTER (WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '30 days') AS last30d_paise,
          COUNT(*)          FILTER (WHERE status = 'completed')                             AS transactions
        FROM payments
      `),
      db.query(`
        SELECT
          affirmation_day_number AS day,
          COUNT(*) AS sessions_completed
        FROM daily_sessions
        WHERE state = 'completed'
        GROUP BY affirmation_day_number
        ORDER BY affirmation_day_number
      `),
    ]);

    res.json({
      users: {
        total:         parseInt(users.total_users),
        new_30d:       parseInt(users.new_30d),
        new_7d:        parseInt(users.new_7d),
        premium_count: parseInt(users.premium_count),
        deleted_count: parseInt(users.deleted_count),
      },
      journeys: {
        active:              parseInt(journeys.active),
        completed:           parseInt(journeys.completed),
        generating:          parseInt(journeys.generating),
        onboarding:          parseInt(journeys.onboarding),
        avg_affirmation_day: parseFloat(journeys.avg_day) || 0,
        completion_rate_pct: parseFloat(journeys.completion_rate_pct) || 0,
      },
      revenue: {
        total_inr:    Math.round((parseInt(revenue.total_paise) || 0) / 100),
        last_30d_inr: Math.round((parseInt(revenue.last30d_paise) || 0) / 100),
        transactions: parseInt(revenue.transactions),
      },
      retention_by_day: retention.map(r => ({
        day:       parseInt(r.day),
        completed: parseInt(r.sessions_completed),
      })),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/crisis-events
// Unresolved crisis events for human review
// ─────────────────────────────────────────────────────────────
router.get('/crisis-events', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT
         ce.id,
         ce.crisis_type,
         ce.trigger_context,
         ce.resources_shown,
         ce.reviewed,
         ce.created_at,
         ce.journey_id,
         ce.user_id
       FROM crisis_events ce
       WHERE ce.reviewed = false
       ORDER BY ce.created_at DESC
       LIMIT 50`
    );
    // Note: user PII NOT included — admin sees only snippet + type + timestamp
    res.json({ crisis_events: rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/crisis-events/:id/resolve
// Mark a crisis event as reviewed/resolved
// ─────────────────────────────────────────────────────────────
router.patch('/crisis-events/:id/resolve', async (req, res, next) => {
  try {
    const { rows: [event] } = await db.query(
      `UPDATE crisis_events SET reviewed = true
       WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });
    logger.info({ eventId: req.params.id, adminEmail: req.user.email }, 'Crisis event resolved');
    res.json({ resolved: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/generation-health
// Content pipeline health: pending/failed jobs
// ─────────────────────────────────────────────────────────────
router.get('/generation-health', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT
         job_type,
         status,
         COUNT(*) AS count,
         MAX(created_at) AS latest
       FROM content_generation_jobs
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY job_type, status
       ORDER BY job_type, status`
    );
    res.json({ jobs: rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/journeys/:id/activate   (dev/test helper)
// Force a journey to 'active' status so daily journey routes can be tested.
// Also seeds affirmation_days rows 1-21 if they don't exist yet.
// ─────────────────────────────────────────────────────────────
router.post('/journeys/:id/activate', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Activate the journey
    const { rows: [journey] } = await db.query(
      `UPDATE journeys
       SET status = 'active', calendar_started_at = COALESCE(calendar_started_at, NOW()),
           current_affirmation_day = GREATEST(COALESCE(current_affirmation_day, 0), 1),
           current_calendar_day    = GREATEST(COALESCE(current_calendar_day, 0), 1),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, current_affirmation_day`,
      [id]
    );
    if (!journey) return res.status(404).json({ error: 'Journey not found' });

    // Seed stub affirmation_days rows 1-21 — upsert so empty rows get filled in
    for (let day = 1; day <= 21; day++) {
      const doubt        = `Day ${day}: I wonder if I'm really capable of this change.`;
      const reframe      = 'Every challenge is proof that you are growing beyond your old limits.';
      const truth        = `Day ${day} of 21: I am becoming the person I was always meant to be.`;
      const actionPrompt = 'Take one small action today that your future self will thank you for.';

      await db.query(
        `INSERT INTO affirmation_days
           (journey_id, day_number, doubt, reframe, truth_statement, action_prompt, content_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (journey_id, day_number) DO UPDATE
           SET doubt         = COALESCE(NULLIF(affirmation_days.doubt, ''), EXCLUDED.doubt),
               reframe       = COALESCE(NULLIF(affirmation_days.reframe, ''), EXCLUDED.reframe),
               truth_statement = COALESCE(NULLIF(affirmation_days.truth_statement, ''), EXCLUDED.truth_statement),
               action_prompt = COALESCE(NULLIF(affirmation_days.action_prompt, ''), EXCLUDED.action_prompt),
               updated_at    = NOW()`,
        [id, day, doubt, reframe, truth, actionPrompt]
      );
    }

    // Ensure Day 1 daily_session exists and is morning_unlocked (if currently locked/completed, reset for testing)
    await db.query(
      `INSERT INTO daily_sessions (journey_id, affirmation_day_number, calendar_date, state)
       VALUES ($1, 1, CURRENT_DATE, 'morning_unlocked')
       ON CONFLICT (journey_id, affirmation_day_number)
       DO UPDATE SET state = 'morning_unlocked', updated_at = NOW()`,
      [id]
    );

    logger.info({ journeyId: id, adminEmail: req.user.email }, 'Journey force-activated (dev)');
    res.json({ success: true, journey });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/journeys/:id/advance-day    (dev/test helper)
// Force the journey to the next affirmation day so testing can proceed
// without waiting for 24h auto-unlock.
// ─────────────────────────────────────────────────────────────
router.post('/journeys/:id/advance-day', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: [journey] } = await db.query(
      `SELECT current_affirmation_day FROM journeys WHERE id = $1 AND status = 'active'`,
      [id]
    );
    if (!journey) return res.status(404).json({ error: 'Active journey not found' });

    const currentDay = journey.current_affirmation_day || 1;
    const nextDay = currentDay + 1;

    if (nextDay > 21) {
      return res.status(400).json({ error: 'Journey already at day 21 or beyond' });
    }

    // Mark current day's session as completed (if not already)
    await db.query(
      `UPDATE daily_sessions
       SET state = 'completed',
           morning_completed_at  = COALESCE(morning_completed_at, NOW()),
           evening_completed_at  = COALESCE(evening_completed_at, NOW()),
           checkin_completed_at  = COALESCE(checkin_completed_at, NOW()),
           updated_at = NOW()
       WHERE journey_id = $1 AND affirmation_day_number = $2`,
      [id, currentDay]
    );

    // Unlock next day
    await db.query(
      `INSERT INTO daily_sessions (journey_id, affirmation_day_number, calendar_date, state)
       VALUES ($1, $2, CURRENT_DATE, 'morning_unlocked')
       ON CONFLICT (journey_id, affirmation_day_number)
       DO UPDATE SET state = 'morning_unlocked', updated_at = NOW()`,
      [id, nextDay]
    );

    // Update journey counter
    await db.query(
      `UPDATE journeys SET current_affirmation_day = $1, updated_at = NOW() WHERE id = $2`,
      [nextDay, id]
    );

    logger.info({ journeyId: id, from: currentDay, to: nextDay, adminEmail: req.user.email }, 'Journey day advanced (dev)');
    res.json({ success: true, previous_day: currentDay, current_day: nextDay });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/journeys/:id/generate-all-infographics
// Generate Bannerbear infographic cards for all 21 days.
// ─────────────────────────────────────────────────────────────
router.post('/journeys/:id/generate-all-infographics', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { from_day = 1, to_day = 21 } = req.query;

    const { rows: [journey] } = await db.query(
      `SELECT j.track, u.name AS user_name FROM journeys j JOIN users u ON u.id = j.user_id WHERE j.id = $1`,
      [id]
    );
    if (!journey) return res.status(404).json({ error: 'Journey not found' });

    const bannerbear = require('../services/bannerbear');
    const results = [];

    for (let dayNum = parseInt(from_day); dayNum <= parseInt(to_day); dayNum++) {
      const { rows: [affDay] } = await db.query(
        `SELECT day_number, doubt, reframe, truth_statement, action_prompt, infographic_path
         FROM affirmation_days WHERE journey_id = $1 AND day_number = $2`,
        [id, dayNum]
      );

      if (!affDay || !affDay.truth_statement) {
        results.push({ day: dayNum, status: 'skipped', reason: 'no content' });
        continue;
      }

      if (affDay.infographic_path) {
        results.push({ day: dayNum, status: 'skipped', reason: 'already exists' });
        continue;
      }

      try {
        const imageUrl = await bannerbear.generateInfographic({
          journey_id:      id,
          day_number:      dayNum,
          track:           journey.track,
          doubt:           affDay.doubt,
          reframe:         affDay.reframe,
          truth_statement: affDay.truth_statement,
          action_prompt:   affDay.action_prompt,
          user_name:       journey.user_name,
        });

        await db.query(
          `UPDATE affirmation_days SET infographic_path = $1, infographic_status = 'ready'::generation_status, updated_at = NOW()
           WHERE journey_id = $2 AND day_number = $3`,
          [imageUrl, id, dayNum]
        );

        results.push({ day: dayNum, status: 'generated', url: imageUrl });
        logger.info({ journeyId: id, day: dayNum }, 'Infographic generated');
      } catch (err) {
        results.push({ day: dayNum, status: 'failed', error: err.message });
        logger.error({ err, journeyId: id, day: dayNum }, 'Infographic generation failed');
      }
    }

    res.json({ success: true, results });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/journeys/:id/generate-audio/:day
// Generate TTS audio via OpenAI tts-1 and upload to R2.
// ─────────────────────────────────────────────────────────────
router.post('/journeys/:id/generate-audio/:day', async (req, res, next) => {
  try {
    const { id, day } = req.params;
    const dayNum = parseInt(day, 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 21) {
      return res.status(400).json({ error: 'Day must be 1–21' });
    }

    const { rows: [affDay] } = await db.query(
      `SELECT truth_statement FROM affirmation_days
       WHERE journey_id = $1 AND day_number = $2`,
      [id, dayNum]
    );
    if (!affDay || !affDay.truth_statement) {
      return res.status(404).json({ error: 'No content for this day yet' });
    }

    // Inline OpenAI TTS — bypasses tts.js module cache
    const OpenAI  = require('openai');
    const storage = require('../services/storage');
    const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let morningPath = null;
    let eveningPath = null;
    const errors = [];

    async function callTTS(voice) {
      const resp = await openai.audio.speech.create({
        model: 'tts-1', voice, input: affDay.truth_statement, response_format: 'mp3',
      });
      return Buffer.from(await resp.arrayBuffer());
    }

    try {
      const buf = await callTTS('nova');     // energizing morning voice
      morningPath = storage.assetPath(id, dayNum, 'morning.mp3');
      await storage.uploadFile(morningPath, buf, 'audio/mpeg');
    } catch (e) { errors.push(`morning: ${e.message}`); morningPath = null; }

    try {
      const buf = await callTTS('shimmer'); // calming evening voice
      eveningPath = storage.assetPath(id, dayNum, 'evening.mp3');
      await storage.uploadFile(eveningPath, buf, 'audio/mpeg');
    } catch (e) { errors.push(`evening: ${e.message}`); eveningPath = null; }

    await db.query(
      `UPDATE affirmation_days
       SET morning_audio_path = COALESCE($1, morning_audio_path),
           evening_audio_path = COALESCE($2, evening_audio_path),
           audio_status = CASE WHEN $1 IS NOT NULL THEN 'ready'::generation_status ELSE audio_status END,
           updated_at = NOW()
       WHERE journey_id = $3 AND day_number = $4`,
      [morningPath, eveningPath, id, dayNum]
    );

    logger.info({ id, dayNum, morningPath, eveningPath }, 'Admin audio generation complete');
    res.json({ success: true, day: dayNum, morning_path: morningPath, evening_path: eveningPath,
               errors: errors.length ? errors : undefined });
  } catch (err) { next(err); }
});

module.exports = router;
