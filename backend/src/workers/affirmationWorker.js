/**
 * Affirmation Generation Worker
 * Generates all 21 days of content, then enqueues audio + infographic jobs per day.
 */
const db      = require('../db');
const ai      = require('../services/ai');
const logger  = require('../utils/logger');

async function processAffirmations(job) {
  const {
    journey_id, track, language, problem_statement, goal_statement,
    inner_voice_belief, identity_shift_needed, core_belief_to_change,
    calibration_data, voice_clone_id, music_style,
  } = job.data;

  logger.info({ journey_id, jobId: job.id }, 'Affirmation generation started');

  try {
    // Generate all 21 days
    const days = await ai.generateAffirmationArc({
      track, language, problem_statement, goal_statement,
      inner_voice_belief, identity_shift_needed, core_belief_to_change, calibration_data,
    });

    // Moderate + save each day
    for (const day of days) {
      const mod = await ai.moderateContent(day.truth_statement);
      if (!mod.safe) {
        logger.warn({ journey_id, day: day.day_number, reason: mod.reason }, 'Day flagged by moderation — skipping and using reframe');
        // Use a safe fallback from the reframe
        day.truth_statement = day.reframe;
      }

      await db.query(
        `INSERT INTO affirmation_days
           (journey_id, day_number, doubt, reframe, truth_statement, action_prompt, content_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ready')
         ON CONFLICT (journey_id, day_number)
         DO UPDATE SET
           doubt = $3, reframe = $4, truth_statement = $5, action_prompt = $6, content_status = 'ready',
           updated_at = NOW()`,
        [journey_id, day.day_number, day.doubt, day.reframe, day.truth_statement, day.action_prompt]
      );

      // Track job for each day's audio + infographic
      await db.query(
        `INSERT INTO content_generation_jobs (journey_id, job_type, day_number, status)
         VALUES ($1, 'audio_generation', $2, 'queued'),
                ($1, 'infographic_generation', $2, 'queued')
         ON CONFLICT DO NOTHING`,
        [journey_id, day.day_number]
      );
    }

    // Enqueue audio generation per day
    const { audioQueue, infographicQueue } = require('./index');
    const { rows: journeyRow } = await db.query(
      'SELECT language, voice_clone_id, music_style FROM journeys WHERE id = $1',
      [journey_id]
    );
    const { rows: allDays } = await db.query(
      'SELECT day_number, truth_statement FROM affirmation_days WHERE journey_id = $1 ORDER BY day_number',
      [journey_id]
    );

    for (const day of allDays) {
      await audioQueue.add('generate-audio', {
        journey_id,
        day_number:      day.day_number,
        truth_statement: day.truth_statement,
        language:        journeyRow[0].language,
        voice_clone_id:  journeyRow[0].voice_clone_id || null,
        music_style:     journeyRow[0].music_style,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } });

      await infographicQueue.add('render-infographic', {
        journey_id,
        day_number: day.day_number,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } });
    }

    logger.info({ journey_id, days: days.length }, 'All affirmation days generated, audio/infographic jobs enqueued');
  } catch (err) {
    logger.error({ err, journey_id }, 'Affirmation generation failed');
    throw err;
  }
}

module.exports = { processAffirmations };
