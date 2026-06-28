/**
 * Audio Generation Worker
 * Generates morning + evening MP3 (2-3 min each) for one affirmation day and uploads to R2.
 * Uses tts.generateFullAudio() — GPT-4o script → TTS → FFmpeg music mix.
 */
const db      = require('../db');
const tts     = require('../services/tts');
const storage = require('../services/storage');
const logger  = require('../utils/logger');

async function processAudio(job) {
  const { journey_id, day_number, language, music_style } = job.data;
  logger.info({ journey_id, day_number, jobId: job.id }, 'Audio generation started');

  try {
    // Fetch full day content + journey track from DB
    const { rows: [dayContent] } = await db.query(
      `SELECT ad.doubt, ad.reframe, ad.truth_statement, ad.action_prompt, j.track
       FROM affirmation_days ad
       JOIN journeys j ON j.id = ad.journey_id
       WHERE ad.journey_id = $1 AND ad.day_number = $2`,
      [journey_id, day_number]
    );
    if (!dayContent || !dayContent.truth_statement) {
      throw new Error(`No content found for journey ${journey_id} day ${day_number}`);
    }

    const dayData = { day_number, ...dayContent };

    // Generate full 2-3 min morning + evening audio
    const [morningBuf, eveningBuf] = await Promise.all([
      tts.generateFullAudio(dayData, language || 'en', 'energizing', music_style || 'calm', dayContent.track || 'confidence'),
      tts.generateFullAudio(dayData, language || 'en', 'calming',    music_style || 'calm', dayContent.track || 'confidence'),
    ]);

    // Upload to R2
    const morningPath = storage.assetPath(journey_id, day_number, 'morning.mp3');
    const eveningPath = storage.assetPath(journey_id, day_number, 'evening.mp3');

    await Promise.all([
      storage.uploadFile(morningPath, morningBuf, 'audio/mpeg'),
      storage.uploadFile(eveningPath, eveningBuf, 'audio/mpeg'),
    ]);

    // Update affirmation_days
    await db.query(
      `UPDATE affirmation_days
       SET morning_audio_path = $1, evening_audio_path = $2, audio_status = 'ready', updated_at = NOW()
       WHERE journey_id = $3 AND day_number = $4`,
      [morningPath, eveningPath, journey_id, day_number]
    );

    // Update job status
    await db.query(
      `UPDATE content_generation_jobs SET status = 'completed', completed_at = NOW()
       WHERE journey_id = $1 AND job_type = 'audio_generation' AND day_number = $2`,
      [journey_id, day_number]
    );

    await checkAndActivateJourney(journey_id);
    logger.info({ journey_id, day_number }, 'Audio generation complete');
  } catch (err) {
    logger.error({ err, journey_id, day_number }, 'Audio generation failed');
    await db.query(
      `UPDATE content_generation_jobs SET status = 'failed', error_message = $1, attempts = attempts + 1
       WHERE journey_id = $2 AND job_type = 'audio_generation' AND day_number = $3`,
      [err.message, journey_id, day_number]
    );
    throw err;
  }
}

/**
 * After each audio/infographic job completes, check if ALL jobs for this journey are done.
 * If yes, activate the journey.
 */
async function checkAndActivateJourney(journeyId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE status != 'completed') AS pending
     FROM content_generation_jobs
     WHERE journey_id = $1 AND job_type IN ('audio_generation', 'infographic_generation')`,
    [journeyId]
  );

  if (parseInt(rows[0].pending) === 0) {
    const { rows: [j] } = await db.query(
      `UPDATE journeys
       SET status = 'active', calendar_started_at = COALESCE(calendar_started_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND status = 'generating'
       RETURNING id, status`,
      [journeyId]
    );

    if (j) {
      logger.info({ journeyId }, 'All content ready — journey activated');

      // Create Day 1 session as unlocked
      await db.query(
        `INSERT INTO daily_sessions (journey_id, affirmation_day_number, calendar_date, state)
         VALUES ($1, 1, CURRENT_DATE, 'morning_unlocked')
         ON CONFLICT DO NOTHING`,
        [journeyId]
      );

      // Notify user via push / WhatsApp (fire-and-forget)
      notifyJourneyReady(journeyId).catch(err =>
        logger.error({ err, journeyId }, 'Journey ready notification failed')
      );
    }
  }
}

async function notifyJourneyReady(journeyId) {
  const axios = require('axios');
  if (process.env.N8N_WEBHOOK_URL_JOURNEY_READY) {
    await axios.post(process.env.N8N_WEBHOOK_URL_JOURNEY_READY,
      { journey_id: journeyId },
      { headers: { 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET }, timeout: 5000 }
    );
  }
}

module.exports = { processAudio };
