/**
 * Preview Generation Worker
 * High priority — user is on the payment screen waiting for their Day 1 preview.
 *
 * Steps:
 * 1. Fetch journey data
 * 2. Generate Day 1 affirmation content (GPT-4o)
 * 3. Save to affirmation_days
 * 4. Generate preview audio clip (ElevenLabs/Sarvam)
 * 5. Render Day 1 infographic (Bannerbear)
 * 6. Upload both to R2
 * 7. Notify frontend via job completion
 *
 * After preview is done, this worker also enqueues the full 21-day generation.
 */
const db      = require('../db');
const ai      = require('../services/ai');
const tts     = require('../services/tts');
const storage = require('../services/storage');
const bannerbear = require('../services/bannerbear');
const logger  = require('../utils/logger');
// Queues lazy-loaded inside functions to avoid circular dependency

async function processPreview(job) {
  const { journey_id } = job.data;
  logger.info({ journey_id, jobId: job.id }, 'Preview generation started');

  await updateJobStatus(journey_id, 'preview_generation', 'processing', String(job.id));

  try {
    // 1. Fetch journey
    const { rows: [journey] } = await db.query(
      `SELECT * FROM journeys WHERE id = $1`,
      [journey_id]
    );
    if (!journey) throw new Error(`Journey ${journey_id} not found`);

    // 2. Generate Day 1 affirmation (just Day 1, not the full 21)
    const day1 = await generateDay1Content(journey);

    // 3. Content moderation
    const modResult = await ai.moderateContent(day1.truth_statement);
    if (!modResult.safe) {
      logger.warn({ journey_id, reason: modResult.reason }, 'Day 1 content flagged — regenerating');
      // Simple retry: regenerate once
      const day1v2 = await generateDay1Content(journey);
      Object.assign(day1, day1v2);
    }

    // 4. Save Day 1 to affirmation_days
    await db.query(
      `INSERT INTO affirmation_days
         (journey_id, day_number, doubt, reframe, truth_statement, action_prompt, content_status)
       VALUES ($1, 1, $2, $3, $4, $5, 'ready')
       ON CONFLICT (journey_id, day_number)
       DO UPDATE SET doubt = $2, reframe = $3, truth_statement = $4, action_prompt = $5, content_status = 'ready'`,
      [journey_id, day1.doubt, day1.reframe, day1.truth_statement, day1.action_prompt]
    );

    // 5. Generate preview audio clip (optional — skip gracefully if TTS not configured)
    let previewAudioPath = null;
    try {
      // Pass full day1 object (not just truth_statement)
      const previewAudioBuffer = await tts.generatePreviewClip(
        day1,
        journey.language || 'en',
        'energizing',
        journey.music_style || 'calm',
        journey.track || 'confidence'
      );
      previewAudioPath = storage.previewAudioPath(journey_id);
      await storage.uploadFile(previewAudioPath, previewAudioBuffer, 'audio/mpeg');
      logger.info({ journey_id }, 'Preview audio generated');
    } catch (ttsErr) {
      logger.warn({ journey_id, err: ttsErr.message }, 'TTS failed — skipping preview audio (non-fatal)');
    }

    // 6. Render Day 1 infographic via Bannerbear (optional — skip if not configured)
    // Fetch user name for the infographic
    const { rows: [userRow] } = await db.query('SELECT name FROM users WHERE id = $1', [journey.user_id]);

    let infographicPath = null;
    try {
      // generateInfographic returns an image URL
      const axios = require('axios');
      const imageUrl = await bannerbear.generateInfographic({
        journey_id,
        day_number:      1,
        track:           journey.track,
        doubt:           day1.doubt,
        reframe:         day1.reframe,
        truth_statement: day1.truth_statement,
        action_prompt:   day1.action_prompt,
        user_name:       userRow?.name || 'You',
      });
      // Download and upload to R2
      const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
      infographicPath = storage.previewInfographicPath(journey_id);
      await storage.uploadFile(infographicPath, Buffer.from(imgResponse.data), 'image/png');
      logger.info({ journey_id }, 'Preview infographic rendered');
    } catch (bbErr) {
      logger.warn({ journey_id, err: bbErr.message }, 'Bannerbear failed — skipping infographic (non-fatal)');
      infographicPath = null;
    }

    // 7. Update affirmation_days with asset paths (only what succeeded)
    await db.query(
      `UPDATE affirmation_days
       SET morning_audio_path = $1::text, infographic_path = $2::text,
           audio_status       = CASE WHEN $1::text IS NOT NULL THEN 'ready'::generation_status ELSE audio_status END,
           infographic_status = CASE WHEN $2::text IS NOT NULL THEN 'ready'::generation_status ELSE infographic_status END
       WHERE journey_id = $3 AND day_number = 1`,
      [previewAudioPath, infographicPath, journey_id]
    );

    await updateJobStatus(journey_id, 'preview_generation', 'completed');
    logger.info({ journey_id }, 'Preview generation complete');

    // 8. Enqueue full 21-day generation
    await enqueueFullGeneration(journey);

  } catch (err) {
    logger.error({ err, journey_id }, 'Preview generation failed');
    await updateJobStatus(journey_id, 'preview_generation', 'failed', String(job.id), err.message);
    throw err; // BullMQ will retry
  }
}

async function generateDay1Content(journey) {
  // Generate just Day 1 by using a simplified prompt
  const prompt = {
    track:                 journey.track,
    language:              journey.language,
    problem_statement:     journey.problem_statement,
    goal_statement:        journey.goal_statement,
    inner_voice_belief:    journey.inner_voice_belief,
    identity_shift_needed: journey.identity_shift_needed,
    core_belief_to_change: journey.core_belief_to_change,
    calibration_data:      journey.calibration_data,
  };

  const days = await ai.generateAffirmationArc(prompt);
  return days[0]; // Return only Day 1
}

async function enqueueFullGeneration(journey) {
  const { affirmationQueue: aq } = require('./index'); // lazy to avoid circular dep

  // Enqueue the full 21-day affirmation generation as a single job
  await aq.add('generate-all-affirmations', {
    journey_id:            journey.id,
    track:                 journey.track,
    language:              journey.language,
    problem_statement:     journey.problem_statement,
    goal_statement:        journey.goal_statement,
    inner_voice_belief:    journey.inner_voice_belief,
    identity_shift_needed: journey.identity_shift_needed,
    core_belief_to_change: journey.core_belief_to_change,
    calibration_data:      journey.calibration_data,
    voice_clone_id:        journey.voice_clone_id || null,
    music_style:           journey.music_style,
  }, { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } });

  logger.info({ journey_id: journey.id }, 'Full generation enqueued');
}

async function updateJobStatus(journeyId, jobType, status, bullJobId, errorMessage) {
  await db.query(
    `UPDATE content_generation_jobs
     SET status = $1::job_status, bull_job_id = COALESCE($2, bull_job_id),
         error_message = $3,
         completed_at = CASE WHEN $1::text IN ('completed', 'failed') THEN NOW() ELSE NULL END,
         attempts = attempts + 1
     WHERE journey_id = $4 AND job_type = $5`,
    [status, bullJobId || null, errorMessage || null, journeyId, jobType]
  );
}

module.exports = { processPreview };
