/**
 * bannerbear.js — Infographic and progress card generation via Bannerbear API
 *
 * Templates (configured in .env):
 *   BANNERBEAR_INFOGRAPHIC_TEMPLATE  — daily Doubt/Reframe/Truth/Action card
 *   BANNERBEAR_PROGRESS_CARD_TEMPLATE — shareable progress card (day complete)
 *   BANNERBEAR_BADGE_TEMPLATE         — achievement badge card
 */

const axios  = require('axios');
const logger = require('../utils/logger');

const BB_API  = 'https://api.bannerbear.com/v2';
const API_KEY = process.env.BANNERBEAR_API_KEY;

const TEMPLATES = {
  infographic:   process.env.BANNERBEAR_INFOGRAPHIC_TEMPLATE,
  progress_card: process.env.BANNERBEAR_PROGRESS_CARD_TEMPLATE,
  badge:         process.env.BANNERBEAR_BADGE_TEMPLATE,
};

const TRACK_COLORS = {
  confidence:    '#C9A84C',
  wealth:        '#22c55e',
  career:        '#3b82f6',
  relationships: '#ec4899',
  health:        '#10b981',
  peace:         '#8b5cf6',
  fitness:       '#f97316',
};

/**
 * Generate a daily infographic card via Bannerbear.
 * Returns the image URL (hosted by Bannerbear).
 */
async function generateInfographic({ journey_id, day_number, track, doubt, reframe, truth_statement, action_prompt, user_name = 'You' }) {
  if (!API_KEY || !TEMPLATES.infographic) {
    throw new Error('Bannerbear API key or infographic template not configured');
  }

  const trackColor = TRACK_COLORS[track] || '#C9A84C';
  const trackLabel = track ? track.charAt(0).toUpperCase() + track.slice(1) : 'Identity';

  const modifications = [
    { name: 'day_number',    text: `Day ${day_number}` },
    { name: 'day_of_total',  text: `Day ${day_number} of 21` },
    { name: 'track_label',   text: trackLabel },
    { name: 'track_color',   color: trackColor },
    { name: 'doubt_text',    text: truncate(doubt, 120) },
    { name: 'reframe_text',  text: truncate(reframe, 150) },
    { name: 'truth_text',    text: truncate(truth_statement, 200) },
    { name: 'action_text',   text: truncate(action_prompt, 80) },
    { name: 'user_name',     text: user_name },
    { name: 'brand_name',    text: 'AuraLoop' },
    { name: 'brand_tagline', text: '21-Day Identity Change' },
  ];

  const imageUrl = await createAndWait(TEMPLATES.infographic, modifications);
  logger.info({ journey_id, day_number, imageUrl }, 'Infographic generated');
  return imageUrl;
}

/**
 * Generate a shareable progress card when a day is completed.
 */
async function generateProgressCard({ journey_id, day_number, calendar_day, user_name, transformation_score, believability_score, track }) {
  if (!API_KEY || !TEMPLATES.progress_card) {
    throw new Error('Bannerbear API key or progress card template not configured');
  }

  const modifications = [
    { name: 'user_name',            text: user_name || 'You' },
    { name: 'affirmation_day',      text: `Affirmation Day ${day_number}` },
    { name: 'calendar_day',         text: `Calendar Day ${calendar_day}` },
    { name: 'transformation_score', text: String(transformation_score || 0) },
    { name: 'believability_score',  text: `${believability_score || 5}/10` },
    { name: 'track_label',          text: (track || 'confidence').charAt(0).toUpperCase() + (track || 'confidence').slice(1) },
    { name: 'track_color',          color: TRACK_COLORS[track] || '#C9A84C' },
    { name: 'brand_name',           text: 'AuraLoop' },
  ];

  const imageUrl = await createAndWait(TEMPLATES.progress_card, modifications);
  logger.info({ journey_id, day_number, imageUrl }, 'Progress card generated');
  return imageUrl;
}

/**
 * Generate a badge card when an achievement is earned.
 */
async function generateBadgeCard({ journey_id, badge_type, user_name, track }) {
  if (!API_KEY || !TEMPLATES.badge) {
    throw new Error('Bannerbear API key or badge template not configured');
  }

  const BADGE_LABELS = {
    journey_completer:   { title: 'Journey Completer',   desc: 'Completed all 21 affirmation days' },
    perfect_consistency: { title: 'Perfect Consistency', desc: 'Completed 21 days in exactly 21 calendar days' },
    strong_momentum:     { title: 'Strong Momentum',     desc: 'Completed Days 1–14 without a single gap' },
    comeback_champion:   { title: 'Comeback Champion',   desc: 'Resumed after a gap and finished the full journey' },
    action_taker:        { title: 'Action Taker',        desc: '80%+ action completion across all milestone days' },
  };

  const badge = BADGE_LABELS[badge_type] || { title: badge_type, desc: '' };

  const modifications = [
    { name: 'user_name',   text: user_name || 'You' },
    { name: 'badge_title', text: badge.title },
    { name: 'badge_desc',  text: badge.desc },
    { name: 'brand_name',  text: 'AuraLoop' },
    { name: 'track_color', color: TRACK_COLORS[track] || '#C9A84C' },
  ];

  const imageUrl = await createAndWait(TEMPLATES.badge, modifications);
  logger.info({ journey_id, badge_type, imageUrl }, 'Badge card generated');
  return imageUrl;
}

// ── Internal helpers ──────────────────────────────────────────

async function createAndWait(templateId, modifications, maxWaitMs = 30_000) {
  const { data: created } = await axios.post(
    `${BB_API}/images`,
    { template: templateId, modifications },
    {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15_000,
    }
  );

  if (created.image_url) return created.image_url;
  if (!created.uid) throw new Error(`Bannerbear: no UID returned for template ${templateId}`);

  const uid      = created.uid;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(2000);
    const { data: status } = await axios.get(
      `${BB_API}/images/${uid}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 10_000 }
    );

    if (status.status === 'completed' && status.image_url) return status.image_url;
    if (status.status === 'failed') throw new Error(`Bannerbear failed: ${JSON.stringify(status.errors)}`);
  }

  throw new Error(`Bannerbear: timed out (uid: ${uid})`);
}

function truncate(str, max) {
  if (!str) return '';
  return str.length <= max ? str : str.substring(0, max - 1) + '…';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { generateInfographic, generateProgressCard, generateBadgeCard };
