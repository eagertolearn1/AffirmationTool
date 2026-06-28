/**
 * Infographic Generation Worker
 * Renders a Bannerbear infographic card for each affirmation day and uploads to R2.
 */
const axios      = require('axios');
const db         = require('../db');
const bannerbear = require('../services/bannerbear');
const storage    = require('../services/storage');
const logger     = require('../utils/logger');
const { checkAndActivateJourney } = require('./audioWorker');

async function processInfographic(job) {
  const { journey_id, day_number } = job.data;
  logger.info({ journey_id, day_number, jobId: job.id }, 'Infographic generation started');

  try {
    // Fetch the day's content + journey track + user name
    const { rows: [day] } = await db.query(
      `SELECT ad.doubt, ad.reframe, ad.truth_statement, ad.action_prompt, j.track, u.name AS user_name
       FROM affirmation_days ad
       JOIN journeys j ON j.id = ad.journey_id
       JOIN users u ON u.id = j.user_id
       WHERE ad.journey_id = $1 AND ad.day_number = $2`,
      [journey_id, day_number]
    );
    if (!day) throw new Error(`affirmation_days not found: journey=${journey_id} day=${day_number}`);

    // Render via Bannerbear — returns an image URL
    const imageUrl = await bannerbear.generateInfographic({
      journey_id,
      day_number,
      track:           day.track,
      doubt:           day.doubt,
      reframe:         day.reframe,
      truth_statement: day.truth_statement,
      action_prompt:   day.action_prompt,
      user_name:       day.user_name,
    });

    // Download image from Bannerbear URL and upload to R2
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
    const imageBuffer = Buffer.from(response.data);

    // Upload to R2
    const infographicPath = storage.assetPath(journey_id, day_number, 'infographic.png');
    await storage.uploadFile(infographicPath, imageBuffer, 'image/png');

    // Update affirmation_days
    await db.query(
      `UPDATE affirmation_days
       SET infographic_path = $1, infographic_status = 'ready', updated_at = NOW()
       WHERE journey_id = $2 AND day_number = $3`,
      [infographicPath, journey_id, day_number]
    );

    // Mark job complete
    await db.query(
      `UPDATE content_generation_jobs SET status = 'completed', completed_at = NOW()
       WHERE journey_id = $1 AND job_type = 'infographic_generation' AND day_number = $2`,
      [journey_id, day_number]
    );

    // Check if all jobs are done → activate journey
    await checkAndActivateJourney(journey_id);
    logger.info({ journey_id, day_number }, 'Infographic generation complete');

  } catch (err) {
    logger.error({ err, journey_id, day_number }, 'Infographic generation failed');
    await db.query(
      `UPDATE content_generation_jobs
       SET status = 'failed', error_message = $1, attempts = attempts + 1
       WHERE journey_id = $2 AND job_type = 'infographic_generation' AND day_number = $3`,
      [err.message, journey_id, day_number]
    );
    throw err;
  }
}

module.exports = { processInfographic };
