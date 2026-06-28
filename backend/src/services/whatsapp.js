/**
 * whatsapp.js — WhatsApp Business messaging via Interakt API
 *
 * All messages use pre-approved WhatsApp Business templates.
 * Templates must be created and approved in the Interakt dashboard
 * before messages will deliver.
 *
 * Template names (register these in Interakt):
 *   auraloop_morning_reminder   — {user_name}, {day_number}, {track}
 *   auraloop_evening_reminder   — {user_name}, {day_number}
 *   auraloop_re_engagement      — {user_name}, {track}
 *   auraloop_milestone_reached  — {user_name}, {day_number}, {score}
 *   auraloop_journey_complete   — {user_name}
 */

const axios  = require('axios');
const logger = require('../utils/logger');

const API_URL   = process.env.WHATSAPP_API_URL   || 'https://api.interakt.ai';
const API_TOKEN = process.env.WHATSAPP_API_TOKEN;

/**
 * Send a WhatsApp template message via Interakt.
 */
async function sendTemplate({ phoneNumber, templateName, languageCode = 'en', bodyValues = [], headerValues = [] }) {
  if (!API_TOKEN || API_TOKEN === 'YOUR_TOKEN') {
    logger.warn({ templateName, phoneNumber }, 'WhatsApp token not configured — skipping');
    return { skipped: true };
  }
  if (!phoneNumber) {
    logger.warn({ templateName }, 'No phone number — skipping WhatsApp message');
    return { skipped: true };
  }

  // Parse country code from number (e.g. +91 9876543210 → countryCode: +91, phoneNumber: 9876543210)
  const cleaned = phoneNumber.replace(/\s+/g, '');
  const match   = cleaned.match(/^(\+\d{1,3})(\d+)$/);
  const countryCode = match ? match[1] : '+91';
  const localNumber = match ? match[2] : cleaned.replace(/^\+/, '');

  try {
    const { data } = await axios.post(
      `${API_URL}/v1/public/message/`,
      {
        countryCode,
        phoneNumber: localNumber,
        type:        'Template',
        template: {
          name:         templateName,
          languageCode,
          headerValues,
          bodyValues,
        },
      },
      {
        headers: {
          Authorization:  `Basic ${Buffer.from(API_TOKEN).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );
    logger.info({ templateName, phoneNumber, result: data.result }, 'WhatsApp message sent');
    return data;
  } catch (err) {
    logger.error({ err: err.message, templateName, phoneNumber }, 'WhatsApp send failed');
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level message helpers (called by scheduler + workers)
// ─────────────────────────────────────────────────────────────────────────────

async function sendMorningReminder({ phoneNumber, userName, dayNumber, track, language = 'en' }) {
  return sendTemplate({
    phoneNumber,
    templateName:  'auraloop_morning_reminder',
    languageCode:   language,
    bodyValues:    [userName || 'Friend', String(dayNumber), track || 'identity'],
  });
}

async function sendEveningReminder({ phoneNumber, userName, dayNumber, language = 'en' }) {
  return sendTemplate({
    phoneNumber,
    templateName:  'auraloop_evening_reminder',
    languageCode:   language,
    bodyValues:    [userName || 'Friend', String(dayNumber)],
  });
}

async function sendReEngagementNudge({ phoneNumber, userName, track, dayNumber, language = 'en' }) {
  return sendTemplate({
    phoneNumber,
    templateName:  'auraloop_re_engagement',
    languageCode:   language,
    bodyValues:    [userName || 'Friend', track || 'your identity', String(dayNumber)],
  });
}

async function sendMilestoneReached({ phoneNumber, userName, dayNumber, transformationScore, language = 'en' }) {
  return sendTemplate({
    phoneNumber,
    templateName:  'auraloop_milestone_reached',
    languageCode:   language,
    bodyValues:    [userName || 'Friend', String(dayNumber), String(Math.round(transformationScore || 0))],
  });
}

async function sendJourneyComplete({ phoneNumber, userName, language = 'en' }) {
  return sendTemplate({
    phoneNumber,
    templateName:  'auraloop_journey_complete',
    languageCode:   language,
    bodyValues:    [userName || 'Friend'],
  });
}

async function sendDayCompleteWithCard({ phoneNumber, userName, dayNumber, progressCardUrl, language = 'en' }) {
  return sendTemplate({
    phoneNumber,
    templateName:  'auraloop_day_complete',
    languageCode:   language,
    headerValues:  [progressCardUrl],   // image URL in header
    bodyValues:    [userName || 'Friend', String(dayNumber)],
  });
}

module.exports = {
  sendMorningReminder,
  sendEveningReminder,
  sendReEngagementNudge,
  sendMilestoneReached,
  sendJourneyComplete,
  sendDayCompleteWithCard,
  sendTemplate,
};
