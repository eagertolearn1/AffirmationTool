/**
 * scheduler.js — Automated WhatsApp reminders + re-engagement nudges
 *
 * Runs cron-style jobs using BullMQ repeatable jobs.
 * All times are IST (UTC+5:30).
 *
 * Jobs:
 *   morning_reminders  — 8:00 AM IST daily  (UTC: 02:30)
 *   evening_reminders  — 7:00 PM IST daily  (UTC: 13:30)
 *   reengagement_check — Every hour (checks for 48h inactive users)
 */

const { Queue, Worker } = require('bullmq');
const db        = require('../db');
const wa        = require('./whatsapp');
const logger    = require('../utils/logger');

let reminderQueue;
let reminderWorker;

async function processReminderJob(job) {
  const { type } = job.data;

  if (type === 'morning_reminders')  return runMorningReminders();
  if (type === 'evening_reminders')  return runEveningReminders();
  if (type === 'reengagement_check') return runReEngagementCheck();

  logger.warn({ type }, 'Unknown reminder job type');
}

// ─────────────────────────────────────────────────────────────────────────────
// Morning reminders — users who haven't completed today's morning session
// ─────────────────────────────────────────────────────────────────────────────
async function runMorningReminders() {
  // Find active journeys where user opted into WhatsApp and today's morning is not done
  const { rows } = await db.query(`
    SELECT
      j.id        AS journey_id,
      j.track,
      j.language,
      j.current_affirmation_day,
      u.name      AS user_name,
      u.whatsapp_number,
      ds.state
    FROM journeys j
    JOIN users u ON u.id = j.user_id
    LEFT JOIN daily_sessions ds ON (
      ds.journey_id = j.id
      AND ds.affirmation_day_number = j.current_affirmation_day
    )
    WHERE j.status = 'active'
      AND u.whatsapp_opted_in = true
      AND u.whatsapp_number IS NOT NULL
      AND u.whatsapp_number != ''
      AND (ds.state IS NULL OR ds.state = 'morning_unlocked')
  `);

  logger.info({ count: rows.length }, 'Sending morning reminders');
  let sent = 0, failed = 0;

  for (const row of rows) {
    try {
      await wa.sendMorningReminder({
        phoneNumber: row.whatsapp_number,
        userName:    row.user_name,
        dayNumber:   row.current_affirmation_day,
        track:       row.track,
        language:    row.language || 'en',
      });
      sent++;
    } catch {
      failed++;
    }
    await sleep(200); // rate limit
  }

  logger.info({ sent, failed }, 'Morning reminders complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Evening reminders — morning done but evening not yet done
// ─────────────────────────────────────────────────────────────────────────────
async function runEveningReminders() {
  const { rows } = await db.query(`
    SELECT
      j.id        AS journey_id,
      j.language,
      j.current_affirmation_day,
      u.name      AS user_name,
      u.whatsapp_number,
      ds.state
    FROM journeys j
    JOIN users u ON u.id = j.user_id
    LEFT JOIN daily_sessions ds ON (
      ds.journey_id = j.id
      AND ds.affirmation_day_number = j.current_affirmation_day
    )
    WHERE j.status = 'active'
      AND u.whatsapp_opted_in = true
      AND u.whatsapp_number IS NOT NULL
      AND u.whatsapp_number != ''
      AND ds.state = 'evening_unlocked'
  `);

  logger.info({ count: rows.length }, 'Sending evening reminders');
  let sent = 0, failed = 0;

  for (const row of rows) {
    try {
      await wa.sendEveningReminder({
        phoneNumber: row.whatsapp_number,
        userName:    row.user_name,
        dayNumber:   row.current_affirmation_day,
        language:    row.language || 'en',
      });
      sent++;
    } catch {
      failed++;
    }
    await sleep(200);
  }

  logger.info({ sent, failed }, 'Evening reminders complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-engagement nudge — users inactive for 48+ hours
// ─────────────────────────────────────────────────────────────────────────────
async function runReEngagementCheck() {
  // Find users whose last completed session was 48+ hours ago and haven't been nudged recently
  const { rows } = await db.query(`
    SELECT DISTINCT ON (j.id)
      j.id        AS journey_id,
      j.track,
      j.language,
      j.current_affirmation_day,
      u.name      AS user_name,
      u.whatsapp_number,
      ds.updated_at AS last_activity
    FROM journeys j
    JOIN users u ON u.id = j.user_id
    JOIN daily_sessions ds ON ds.journey_id = j.id
    WHERE j.status = 'active'
      AND u.whatsapp_opted_in = true
      AND u.whatsapp_number IS NOT NULL
      AND u.whatsapp_number != ''
      AND ds.state != 'completed'
    ORDER BY j.id, ds.updated_at DESC
  `);

  const now = Date.now();
  let nudged = 0;

  for (const row of rows) {
    const lastActivity = new Date(row.last_activity).getTime();
    const hoursInactive = (now - lastActivity) / (1000 * 60 * 60);

    // Send nudge if inactive 48–72 hours (avoid repeat nudges after 72h)
    if (hoursInactive >= 48 && hoursInactive < 72) {
      try {
        await wa.sendReEngagementNudge({
          phoneNumber: row.whatsapp_number,
          userName:    row.user_name,
          track:       row.track,
          dayNumber:   row.current_affirmation_day,
          language:    row.language || 'en',
        });
        nudged++;
        await sleep(200);
      } catch {}
    }
  }

  if (nudged > 0) logger.info({ nudged }, 'Re-engagement nudges sent');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler setup — call once at server startup
// ─────────────────────────────────────────────────────────────────────────────
function startScheduler(connection) {
  reminderQueue = new Queue('reminders', { connection });

  // Remove any stale repeatable jobs from previous runs, then re-add
  reminderQueue.removeRepeatable('morning_reminders',  { cron: '30 2 * * *' }).catch(() => {});
  reminderQueue.removeRepeatable('evening_reminders',  { cron: '30 13 * * *' }).catch(() => {});
  reminderQueue.removeRepeatable('reengagement_check', { cron: '0 * * * *'   }).catch(() => {});

  // 8:00 AM IST = 02:30 UTC
  reminderQueue.add('morning_reminders',  { type: 'morning_reminders'  }, { repeat: { cron: '30 2 * * *'  }, jobId: 'morning-daily'   });
  // 7:00 PM IST = 13:30 UTC
  reminderQueue.add('evening_reminders',  { type: 'evening_reminders'  }, { repeat: { cron: '30 13 * * *' }, jobId: 'evening-daily'   });
  // Re-engagement check every hour
  reminderQueue.add('reengagement_check', { type: 'reengagement_check' }, { repeat: { cron: '0 * * * *'  }, jobId: 'reengagement-hourly' });

  // Worker
  reminderWorker = new Worker('reminders', processReminderJob, {
    connection,
    concurrency: 1, // serial — these do bulk sends
  });

  reminderWorker.on('completed', job => logger.info({ jobId: job.id, name: job.name }, 'Reminder job done'));
  reminderWorker.on('failed',    (job, err) => logger.error({ jobId: job?.id, err }, 'Reminder job failed'));

  logger.info('WhatsApp reminder scheduler started (morning 8am IST, evening 7pm IST, re-engagement hourly)');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { startScheduler };
