const OpenAI = require('openai');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL  = process.env.OPENAI_MODEL || 'gpt-4o';

// ── Crisis detection system instruction ─────────────────────
// Prepended to every GPT call that processes user-submitted text.
const CRISIS_DETECTION_INSTRUCTION = `
SAFETY CHECK — EXECUTE FIRST BEFORE ANY OTHER PROCESSING:
Analyze the user's text for these crisis signals:
- Suicidal ideation or self-harm intent ("want to die", "end it all", "hurt myself", etc.)
- Abuse or immediate danger (physical, emotional, sexual)
- Severe acute distress that requires immediate intervention
- Intent to harm others

If ANY crisis signal is detected:
1. Return ONLY this JSON, nothing else: {"crisis_detected": true, "crisis_type": "<type>"}
2. Do NOT generate the normal response. Do NOT add any other text.

If no crisis signal is detected, proceed with the normal task below.
`.trim();

/**
 * Run crisis detection on a user-submitted text string.
 * Returns { crisis_detected: boolean, crisis_type?: string }
 */
async function detectCrisis(text) {
  if (!text || text.trim().length < 3) return { crisis_detected: false };

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: 60,
      messages: [
        { role: 'system', content: CRISIS_DETECTION_INSTRUCTION },
        { role: 'user',   content: text },
      ],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(resp.choices[0].message.content);
    return result;
  } catch (err) {
    // On detection error, fail safe: treat as no crisis (don't block the user)
    logger.error({ err }, 'Crisis detection failed — failing safe');
    return { crisis_detected: false };
  }
}

/**
 * Surface inner beliefs from a user's problem + goal statements.
 * Returns { inner_voice_belief, identity_shift_needed, core_belief_to_change }
 */
async function surfaceBeliefs({ track, problem_statement, goal_statement }) {
  const systemPrompt = `You are a world-class identity change coach specialising in the ${track} life domain.

A person has shared their situation. Based on their words, identify three things they cannot usually articulate themselves:
1. inner_voice_belief: The exact limiting belief their inner voice is telling them about why change is hard. Quote it as first-person self-talk (e.g., "I'm not smart enough to...").
2. identity_shift_needed: The identity shift required, written as "From X to Y" (e.g., "From someone who avoids money conversations to someone who leads them").
3. core_belief_to_change: The single root belief that — if changed — would make everything else easier. One sentence.

Respond ONLY as valid JSON with exactly these three keys. Be specific, not generic. Use the person's own language.`;

  const userMessage = `Track: ${track}
Problem: ${problem_statement}
Goal: ${goal_statement}`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 300,
    messages: [
      { role: 'system', content: `${CRISIS_DETECTION_INSTRUCTION}\n\n${systemPrompt}` },
      { role: 'user',   content: userMessage },
    ],
    response_format: { type: 'json_object' },
  });

  const content = resp.choices[0].message.content;
  if (content.includes('"crisis_detected":true')) {
    throw Object.assign(new Error('CRISIS'), { crisis: true });
  }
  return JSON.parse(content);
}

/**
 * Generate a 21-day affirmation arc.
 * Returns array of 21 objects: { day_number, doubt, reframe, truth_statement, action_prompt }
 */
async function generateAffirmationArc({
  track,
  language,
  problem_statement,
  goal_statement,
  inner_voice_belief,
  identity_shift_needed,
  core_belief_to_change,
  calibration_data,
}) {
  const systemPrompt = `You are a world-class identity change coach writing a personalised 21-day journey.

Context:
- Life track: ${track}
- Language for delivery: ${language} (write affirmation content in ${language === 'en' ? 'English' : 'the specified language'} unless instructed otherwise — write supporting fields in English)
- Problem: ${problem_statement}
- Goal: ${goal_statement}
- Core limiting belief: ${inner_voice_belief}
- Required identity shift: ${identity_shift_needed}
- Root belief to change: ${core_belief_to_change}

Calibration guidance:
- Day 1 believability target: ${calibration_data?.day1_tone || 'slightly challenging but believable today'}
- Day 21 target: ${calibration_data?.day21_tone || 'ambitious but honest stretch'}

Create exactly 21 days. Each day must build progressively — the doubt gets smaller, the truth gets stronger.

For each day return a JSON object with:
- day_number (1-21)
- doubt (the limiting thought for that day — diminishing across 21 days)
- reframe (the cognitive reframe — the 'and yet...' counter-narrative)
- truth_statement (the identity affirmation for that day — the core deliverable, in the target language)
- action_prompt (one specific micro-action for the day — 5–15 words)

Return a JSON object with a single key "days" containing an array of exactly 21 objects.`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: 'Generate the complete 21-day arc now.' },
    ],
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(resp.choices[0].message.content);
  // Extract array from any wrapper key: { days: [...] }, { affirmations: [...] }, etc.
  let days;
  if (Array.isArray(parsed)) {
    days = parsed;
  } else {
    // Try known keys first, then fall back to first array value found
    days = parsed.days || parsed.affirmations || parsed.journey || parsed.arc ||
      Object.values(parsed).find(v => Array.isArray(v));
  }

  if (!Array.isArray(days) || days.length !== 21) {
    throw new Error(`Expected 21 affirmation days, got ${Array.isArray(days) ? days.length : 'non-array'}`);
  }
  return days;
}

/**
 * Generate a calibration preview: Day 1, 7, 14, 21 samples.
 */
async function generateCalibrationPreview({
  track, problem_statement, goal_statement,
  inner_voice_belief, identity_shift_needed, core_belief_to_change,
}) {
  const systemPrompt = `You are an identity change coach. Based on this person's context, generate a PREVIEW of 4 key days in their 21-day journey to help calibrate intensity.

Return JSON with exactly 4 keys: day_1, day_7, day_14, day_21.
Each key maps to an object with: doubt (string), truth_statement (string).

Make Day 1 feel challenging but achievable TODAY.
Make Day 21 feel like an inspiring but honest stretch.`;

  const userMessage = `Track: ${track}
Problem: ${problem_statement}
Goal: ${goal_statement}
Core belief: ${inner_voice_belief}
Identity shift: ${identity_shift_needed}
Root belief: ${core_belief_to_change}`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(resp.choices[0].message.content);
}

/**
 * Re-calibrate the arc based on user feedback.
 * feedback: { day1_too_big: bool, day21_too_small: bool, day21_too_big: bool }
 */
async function recalibratePreview(existingPreview, feedback, context) {
  const adjustments = [];
  if (feedback.day1_too_big === 'way_too_big') adjustments.push('Make Day 1 MUCH smaller — extremely achievable today.');
  if (feedback.day1_too_big === 'slightly_too_big') adjustments.push('Make Day 1 slightly smaller and more believable today.');
  if (feedback.day21_too_small) adjustments.push('Make Day 21 more ambitious — a bigger, more inspiring stretch.');
  if (feedback.day21_too_big) adjustments.push('Make Day 21 less extreme — still a stretch, but more realistic.');

  if (adjustments.length === 0) return existingPreview;

  const systemPrompt = `You are an identity change coach. Adjust this 4-day preview based on user feedback.

Current preview: ${JSON.stringify(existingPreview)}
Adjustments needed: ${adjustments.join(' ')}

Context: ${JSON.stringify(context)}

Return the same JSON structure: { day_1, day_7, day_14, day_21 } each with doubt and truth_statement.`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.6,
    max_tokens: 600,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Adjust now.' }],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(resp.choices[0].message.content);
}

/**
 * AI coaching response.
 * Includes crisis detection. Returns { crisis_detected, response? }
 */
async function getCoachingResponse({ userMessage, journeyContext, conversationHistory }) {
  const systemPrompt = `${CRISIS_DETECTION_INSTRUCTION}

---

You are a calm, experienced identity change coach. You are NOT a therapist.

This person is on a 21-day identity change journey:
- Track: ${journeyContext.track}
- Problem they're solving: ${journeyContext.problem_statement}
- Goal: ${journeyContext.goal_statement}
- Identity shift: ${journeyContext.identity_shift_needed}
- Today's affirmation day: ${journeyContext.current_affirmation_day}
- Today's truth: "${journeyContext.todays_truth || 'not yet available'}"
- Today's doubt: "${journeyContext.todays_doubt || 'not yet available'}"

Your role: Respond as a trusted mentor. Acknowledge their specific doubt or feeling. Gently reframe it using their journey context. Never be preachy. Never give generic advice. Always reference their specific situation. Keep responses under 150 words. Ask one follow-up question maximum.

You are NOT a crisis counsellor. If crisis signals appear, your safety check will catch them before this instruction runs.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 250,
    messages,
  });

  const content = resp.choices[0].message.content;

  // Check if crisis was detected (model returns JSON instead of normal response)
  try {
    const parsed = JSON.parse(content);
    if (parsed.crisis_detected) return { crisis_detected: true, crisis_type: parsed.crisis_type };
  } catch {
    // Not JSON — normal coaching response
  }

  return { crisis_detected: false, response: content };
}

/**
 * Moderate generated affirmation content before storing.
 * Returns { safe: boolean, reason?: string }
 */
async function moderateContent(text) {
  try {
    const resp = await openai.moderations.create({ input: text });
    const result = resp.results[0];
    if (result.flagged) {
      const categories = Object.entries(result.categories)
        .filter(([, v]) => v)
        .map(([k]) => k);
      return { safe: false, reason: categories.join(', ') };
    }
    return { safe: true };
  } catch (err) {
    logger.error({ err }, 'Content moderation API error — failing open');
    return { safe: true }; // fail open to not block generation
  }
}

/**
 * Generate a full 2–3 minute spoken affirmation script for audio production.
 * Returns a plain-text script ready to pass to TTS (~350–450 words = ~2.5 min at natural pace).
 *
 * @param {object} params
 * @param {string} params.tone         - 'energizing' (morning) | 'calming' (evening)
 * @param {string} params.track        - life track
 * @param {number} params.day_number   - 1–21
 * @param {string} params.doubt        - the day's doubt
 * @param {string} params.reframe      - the day's reframe
 * @param {string} params.truth_statement - the core affirmation
 * @param {string} params.action_prompt  - the day's action
 * @param {string} params.language     - language code
 */
async function generateAffirmationScript({
  tone, track, day_number, doubt, reframe, truth_statement, action_prompt, language = 'en',
}) {
  const isMorning = tone === 'energizing';
  const langNote  = language !== 'en'
    ? `Write the ENTIRE script in ${language}. Adapt phrasing naturally — do not translate word-for-word.`
    : 'Write in English.';

  const systemPrompt = `You are a professional guided meditation and affirmation script writer.
Write a ${isMorning ? 'morning energizing' : 'evening calming'} spoken affirmation audio script.

Rules:
- ${langNote}
- Target length: 350–420 words (approximately 2.5 minutes when spoken at a natural, deliberate pace)
- NEVER include stage directions, brackets, sound cues, or anything that should not be spoken aloud
- Write ONLY the words that will be spoken — pure spoken text
- Use natural pauses by ending sentences. Do NOT write "[pause]" or "..." — just write short sentences.
- Tone: ${isMorning ? 'warm, energizing, forward-looking — like a trusted mentor waking you up to who you are becoming' : 'calm, grounding, integrative — like a trusted guide helping you absorb the day and rest in your new identity'}

Structure (do not label these sections — just write fluidly):
1. Opening (30s): Welcome the listener. Invite them to take 2-3 slow breaths. Ground them in the present moment.
2. Acknowledge the doubt (30s): Gently name today's doubt without amplifying it: "${doubt}"
3. The reframe (40s): Introduce the reframe naturally: "${reframe}"
4. Truth statement — repeated 3 times (60s): State the affirmation "${truth_statement}" — first as a statement, then as an invitation to feel it, then as a declaration of identity.
5. ${isMorning ? 'Action set (20s): Speak the day\'s action intention: "' + action_prompt + '"' : 'Integration (20s): Invite the listener to let this truth settle into the body as they move toward rest.'}
6. Closing (20s): Send them off with warmth. ${isMorning ? 'Energize them for the day.' : 'Help them close the day with peace.'}`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.75,
    max_tokens: 700,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Day ${day_number} of 21. Track: ${track}. Generate the script now.` },
    ],
  });

  return resp.choices[0].message.content.trim();
}

module.exports = {
  detectCrisis,
  surfaceBeliefs,
  generateAffirmationArc,
  generateCalibrationPreview,
  recalibratePreview,
  getCoachingResponse,
  moderateContent,
  generateAffirmationScript,
};
