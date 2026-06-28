const { z } = require('zod');

const TRACKS = ['wealth', 'health', 'career', 'confidence', 'relationships', 'peace', 'fitness'];
const LANGUAGES = ['hi', 'en', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml'];
const MUSIC_STYLES = ['calm', 'uplifting', 'meditative', 'energetic'];

const trackSchema = z.object({
  track: z.enum(TRACKS, { errorMap: () => ({ message: `Track must be one of: ${TRACKS.join(', ')}` }) }),
});

const answersSchema = z.object({
  problem_statement: z.string().min(10, 'Please describe your problem in at least 10 characters').max(2000),
  goal_statement:    z.string().min(10, 'Please describe your goal in at least 10 characters').max(2000),
});

const confirmBeliefsSchema = z.object({
  inner_voice_belief:    z.string().min(5).max(500),
  identity_shift_needed: z.string().min(5).max(500),
  core_belief_to_change: z.string().min(5).max(500),
});

const calibrationFeedbackSchema = z.object({
  day1_believable: z.enum(['yes', 'slightly_too_big', 'way_too_big']),
  day21_feel:      z.enum(['yes', 'too_small', 'too_big']),
});

const preferencesSchema = z.object({
  language:    z.enum(LANGUAGES, { errorMap: () => ({ message: `Language must be one of: ${LANGUAGES.join(', ')}` }) }),
  music_style: z.enum(MUSIC_STYLES, { errorMap: () => ({ message: `Music style must be one of: ${MUSIC_STYLES.join(', ')}` }) }),
});

module.exports = {
  trackSchema,
  answersSchema,
  confirmBeliefsSchema,
  calibrationFeedbackSchema,
  preferencesSchema,
};
