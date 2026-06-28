/**
 * Progress Card Worker
 * Renders a Bannerbear progress card after a user completes a day,
 * uploads it to R2, and fires the n8n day-complete webhook.
 */
const axios      = require('axios');
const db         = require('../db');
const bannerbear = require('../services/bannerbear');
const storage    = require('../services/storage');
const scoring    = require('../services/scoring');
const wa         = require('../services/whatsapp');
const logger     = require('../utils/logger');

async function processProgressCard(job) {
  const { journey_id, day_number, session_id } = job.data;
  logger.info({ journey_id, day_number, jobId: job.id }, 'Progress card generation started');

  try {
    // Fetch user + journey context
    const { rows: [row] } = await db.query(
      `SELECT u.name, j.current_affirmation_day, j.current_calendar_day, j.track
       FROM journeys j
       JOIN users u ON u.id = j.user_id
       WHERE j.id = $1`,
      [journey_id]
    );
    if (!row) throw new Error(`Journey ${journey_id} not found`);

    // Transformation score + latest believability
    const score = await scoring.calculateTransformationScore(journey_id);
    const { rows: [latestCheckin] } = await db.query(
      `SELECT believability_score FROM daily_sessions
       WHERE journey_id = $1 AND believability_score IS NOT NULL
       ORDER BY affirmation_day_number DESC LIMIT 1`,
      [journey_id]
    );

    // Render progress card — returns image URL
    const imageUrl = await bannerbear.generateProgressCard({
      journey_id,
      user_name:            row.name,
      day_number,
      calendar_day:         row.current_calendar_day,
      transformation_score: score,
      believability_score:  latestCheckin?.believability_score || null,
      track:                row.track,
    });

    // Download image from Bannerbear URL and upload to R2
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
    const cardBuffer = Buffer.from(response.data);

    // Upload to R2
    const cardPath = storage.progressCardPath(journey_id, day_number);
    await storage.uploadFile(cardPath, cardBuffer, 'image/png');

    // Save path to the daily_session
    if (session_id) {
      await db.query(
        `UPDATE daily_sessions SET progress_card_path = $1 WHERE id = $2`,
        [cardPath, session_id]
      );
    }

    logger.info({ journey_id, day_number }, 'Progress card uploaded');

    // Fire n8n day-complete webhook (fire-and-forget)
    fireWebhook(journey_id, day_number, cardPath, row, score).catch(err =>
      logger.error({ err, journey_id }, 'Day-complete webhook failed')
    );

  } catch (err) {
    logger.error({ err, journey_id, day_number }, 'Progress card generation failed');
    throw err;
  }
}

async function fireWebhook(journey_id, day_number, cardPath, journeyRow, score) {
  const cardSignedUrl = (await require('../services/storage').getSignedUrl(cardPath)) || null;
  const isMilestone   = [7, 14, 21].includes(day_number);

  // ── Direct WhatsApp message (replaces n8n webhook) ────────────────────────
  try {
    const { rows: [userData] } = await db.query(
      `SELECT u.whatsapp_number, u.whatsapp_opted_in, j.language
       FROM users u JOIN journeys j ON j.user_id = u.id WHERE j.id = $1`,
      [journey_id]
    );

    if (userData?.whatsapp_opted_in && userData?.whatsapp_number) {
      if (isMilestone) {
        // Milestone: send card + score
        await wa.sendMilestoneReached({
          phoneNumber:        userData.whatsapp_number,
          userName:           journeyRow.name,
          dayNumber:          day_number,
          transformationScore: score,
          language:           userData.language || 'en',
        });
      } else if (cardSignedUrl) {
        // Regular day completion with progress card
        await wa.sendDayCompleteWithCard({
          phoneNumber:     userData.whatsapp_number,
          userName:        journeyRow.name,
          dayNumber:       day_number,
          progressCardUrl: cardSignedUrl,
          language:        userData.language || 'en',
        });
      }
    }
  } catch (waErr) {
    logger.warn({ waErr: waErr.message, journey_id, day_number }, 'WhatsApp day-complete send failed (non-fatal)');
  }

  // ── Also fire n8n webhook if configured (optional, for analytics etc.) ────
  const webhookUrl = process.env.N8N_WEBHOOK_URL_DAY_COMPLETE;
  if (webhookUrl) {
    await axios.post(webhookUrl, {
      journey_id, day_number, is_milestone: isMilestone,
      user_name: journeyRow.name, transformation_score: score,
      progress_card_url: cardSignedUrl,
    }, {
      headers: { 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET },
      timeout: 8_000,
    }).catch(e => logger.warn({ e: e.message }, 'n8n webhook failed (non-fatal)'));
  }

  logger.info({ journey_id, day_number, isMilestone }, 'Day-complete notifications sent');
}

module.exports = { processProgressCard };
