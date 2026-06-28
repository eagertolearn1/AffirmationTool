/**
 * tts.js — Text-to-Speech service
 *
 * Pipeline:
 *  1. Generate full 2-3 minute affirmation script via GPT-4o (ai.generateAffirmationScript)
 *  2. Convert script to speech:
 *       - English + Hindi → ElevenLabs (eleven_multilingual_v2) — professional, emotional
 *       - Regional Indian languages → Sarvam AI (bulbul:v1)
 *  3. Mix voice with ambient background music via FFmpeg (audioMixer)
 *
 * Output: a single MP3 buffer, ~2.5 minutes, voice over ambient music.
 */

const OpenAI  = require('openai');
const axios   = require('axios');
const logger  = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ElevenLabs config
const ELEVENLABS_API    = 'https://api.elevenlabs.io/v1';
const ELEVENLABS_MODEL  = 'eleven_multilingual_v2';

// Voice IDs per language (from .env, with defaults)
const ELEVENLABS_VOICE = {
  en: process.env.ELEVENLABS_VOICE_ID_EN || '21m00Tcm4TlvDq8ikWAM', // Rachel — warm English
  hi: process.env.ELEVENLABS_VOICE_ID_HI || 'pNInz6obpgDQGcFmaJgB', // Adam  — strong Hindi
};

// Voice settings per tone — controls delivery feel
const ELEVENLABS_TONE_SETTINGS = {
  energizing: { stability: 0.35, similarity_boost: 0.75, style: 0.50, use_speaker_boost: true  },
  calming:    { stability: 0.75, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true  },
};

// Languages routed to ElevenLabs
const ELEVENLABS_LANGS = new Set(['en', 'hi']);

// Sarvam AI language codes for regional Indian languages
const SARVAM_LANG_MAP = {
  mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN',
  bn: 'bn-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN',
};

// Fallback OpenAI TTS (only used if ElevenLabs key is missing)
const OPENAI_VOICE_MAP = { energizing: 'nova', calming: 'shimmer' };

/**
 * Generate a full 2-3 minute audio affirmation.
 *
 * @param {object} dayContent  - { day_number, doubt, reframe, truth_statement, action_prompt }
 * @param {string} language    - language code ('en', 'hi', 'ta', etc.)
 * @param {string} tone        - 'energizing' (morning) or 'calming' (evening)
 * @param {string} musicStyle  - 'calm' | 'uplifting' | 'meditative' | 'energetic'
 * @param {string} track       - life track (for script context)
 * @returns {Buffer} MP3 audio buffer (~2-3 min)
 */
async function generateFullAudio(dayContent, language = 'en', tone = 'energizing', musicStyle = 'calm', track = 'confidence') {
  const { day_number, doubt, reframe, truth_statement, action_prompt } = dayContent;

  logger.info({ day_number, language, tone, musicStyle }, 'Generating full affirmation audio');

  // Step 1: Generate the 2-3 minute spoken script
  const { generateAffirmationScript } = require('./ai');
  const script = await generateAffirmationScript({
    tone, track, day_number, doubt, reframe, truth_statement, action_prompt, language,
  });

  logger.debug({ day_number, wordCount: script.split(' ').length }, 'Script generated');

  // Step 2: Generate voice audio from script
  let voiceBuffer;
  const lang = language || 'en';

  if (ELEVENLABS_LANGS.has(lang)) {
    voiceBuffer = await generateElevenLabsTTS(script, lang, tone);
  } else if (SARVAM_LANG_MAP[lang]) {
    voiceBuffer = await generateSarvamTTS(script, lang);
  } else {
    // Fallback to ElevenLabs English for any unsupported language
    voiceBuffer = await generateElevenLabsTTS(script, 'en', tone);
  }

  logger.debug({ day_number, voiceBytes: voiceBuffer.length }, 'Voice TTS complete');

  // Step 3: Mix with background music (if FFmpeg available)
  try {
    const { mixVoiceWithMusic, isFFmpegAvailable } = require('./audioMixer');
    const ffmpegAvailable = await isFFmpegAvailable();
    if (ffmpegAvailable) {
      const mixed = await mixVoiceWithMusic(voiceBuffer, musicStyle, tone);
      logger.debug({ day_number, mixedBytes: mixed.length }, 'Audio mixed with background music');
      return mixed;
    }
  } catch (err) {
    logger.warn({ err: err.message, day_number }, 'Audio mixing failed — returning voice-only');
  }

  return voiceBuffer;
}

/**
 * Generate a short 15-20 second preview clip for onboarding.
 */
async function generatePreviewClip(dayContent, language = 'en', tone = 'energizing', musicStyle = 'calm', track = 'confidence') {
  const { truth_statement } = dayContent;

  const previewPrompt = `You are a professional affirmation voice artist. Write a SHORT 15-second opening for an audio affirmation session.
Language: ${language}. Tone: ${tone === 'energizing' ? 'warm and energizing' : 'calm and soothing'}.
Invite the listener to close their eyes, take a breath, and begin. Then speak just the first line of this truth: "${truth_statement}"
Write ONLY the spoken words. No brackets. No directions. About 40-50 words total.`;

  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 100,
    messages: [{ role: 'user', content: previewPrompt }],
  });

  const previewScript = resp.choices[0].message.content.trim();
  const lang = language || 'en';
  const voiceBuffer = ELEVENLABS_LANGS.has(lang)
    ? await generateElevenLabsTTS(previewScript, lang, tone)
    : await generateSarvamTTS(previewScript, lang);

  try {
    const { mixVoiceWithMusic, isFFmpegAvailable } = require('./audioMixer');
    if (await isFFmpegAvailable()) {
      return await mixVoiceWithMusic(voiceBuffer, musicStyle, tone);
    }
  } catch {}

  return voiceBuffer;
}

// ── Internal TTS functions ────────────────────────────────────

/**
 * ElevenLabs TTS — used for English and Hindi.
 * Produces professional, emotionally expressive audio.
 */
async function generateElevenLabsTTS(text, language = 'en', tone = 'energizing') {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    logger.warn('ELEVENLABS_API_KEY not set — falling back to OpenAI TTS');
    return generateOpenAITTS(text, tone);
  }

  const voiceId  = ELEVENLABS_VOICE[language] || ELEVENLABS_VOICE.en;
  const settings = ELEVENLABS_TONE_SETTINGS[tone] || ELEVENLABS_TONE_SETTINGS.energizing;

  logger.debug({ language, tone, voiceId, textLen: text.length }, 'ElevenLabs TTS request');

  const response = await axios.post(
    `${ELEVENLABS_API}/text-to-speech/${voiceId}`,
    {
      text,
      model_id:       ELEVENLABS_MODEL,
      voice_settings: settings,
    },
    {
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      responseType: 'arraybuffer',
      timeout:      120_000, // ElevenLabs can be slow for long text
    }
  );

  return Buffer.from(response.data);
}

/**
 * OpenAI TTS — fallback only (used when ElevenLabs key is missing).
 */
async function generateOpenAITTS(text, tone = 'energizing') {
  const voice = OPENAI_VOICE_MAP[tone] || 'nova';
  const response = await openai.audio.speech.create({
    model:           'tts-1-hd',
    voice,
    input:           text,
    response_format: 'mp3',
    speed:           tone === 'calming' ? 0.9 : 1.0,
  });
  return Buffer.from(await response.arrayBuffer());
}

async function generateSarvamTTS(text, language) {
  const languageCode = SARVAM_LANG_MAP[language];
  if (!languageCode) throw new Error(`Unsupported language for Sarvam: ${language}`);

  const resp = await axios.post(
    process.env.SARVAM_API_URL || 'https://api.sarvam.ai/text-to-speech',
    {
      inputs:               [text],
      target_language_code: languageCode,
      speaker:              'meera',
      pitch:                0,
      pace:                 0.85,
      loudness:             1.5,
      enable_preprocessing: true,
      model:                'bulbul:v1',
    },
    {
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type':          'application/json',
      },
      timeout: 60_000,
    }
  );

  const base64Audio = resp.data.audios?.[0];
  if (!base64Audio) throw new Error('Sarvam returned no audio');
  return Buffer.from(base64Audio, 'base64');
}

/**
 * Legacy: generate speech from plain text (used by older routes).
 * Now routes through ElevenLabs for en/hi.
 */
async function generateSpeech(text, language = 'en', voiceCloneId = null, tone = 'energizing') {
  const lang = language || 'en';
  if (ELEVENLABS_LANGS.has(lang)) {
    return generateElevenLabsTTS(text, lang, tone);
  }
  if (SARVAM_LANG_MAP[lang]) {
    return generateSarvamTTS(text, lang);
  }
  return generateElevenLabsTTS(text, 'en', tone);
}

module.exports = { generateFullAudio, generatePreviewClip, generateSpeech };
