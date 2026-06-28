/**
 * audioMixer.js
 * Mixes a voice MP3 with generated ambient background music using FFmpeg.
 * Background music is synthesized directly via FFmpeg lavfi — no external files needed.
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const execFileAsync = promisify(execFile);

/**
 * Music profiles per style and tone.
 * Uses FFmpeg lavfi audio synthesis — pure sine/noise, royalty-free.
 */
const MUSIC_PROFILES = {
  // Calm: Brown noise + deep low-pass → warm ambient wash
  calm_energizing:  'anoisesrc=color=brown:r=44100,lowpass=f=180,volume=0.08',
  calm_calming:     'anoisesrc=color=brown:r=44100,lowpass=f=140,volume=0.06',

  // Uplifting: 528Hz + 396Hz solfeggio blend — brightness and release
  uplifting_energizing: 'sine=frequency=528:r=44100,volume=0.06[a];sine=frequency=396:r=44100,volume=0.04[b];[a][b]amix=inputs=2',
  uplifting_calming:    'sine=frequency=396:r=44100,volume=0.05[a];sine=frequency=285:r=44100,volume=0.03[b];[a][b]amix=inputs=2',

  // Meditative: 432Hz fundamental + soft overtone — deep stillness
  meditative_energizing: 'sine=frequency=432:r=44100,volume=0.05[a];sine=frequency=216:r=44100,volume=0.03[b];[a][b]amix=inputs=2',
  meditative_calming:    'sine=frequency=432:r=44100,volume=0.04[a];sine=frequency=108:r=44100,volume=0.03[b];anoisesrc=color=brown:r=44100,lowpass=f=80,volume=0.02[c];[a][b][c]amix=inputs=3',

  // Energetic: 440Hz + 528Hz pulse — forward momentum
  energetic_energizing: 'sine=frequency=440:r=44100,volume=0.07[a];sine=frequency=528:r=44100,volume=0.05[b];[a][b]amix=inputs=2',
  energetic_calming:    'sine=frequency=440:r=44100,volume=0.05[a];sine=frequency=396:r=44100,volume=0.04[b];[a][b]amix=inputs=2',
};

/**
 * Mix voice buffer with synthesized background music.
 * @param {Buffer} voiceBuffer  - MP3 audio of the spoken affirmation
 * @param {string} musicStyle   - 'calm' | 'uplifting' | 'meditative' | 'energetic'
 * @param {string} tone         - 'energizing' | 'calming'
 * @returns {Buffer} - Mixed MP3 buffer
 */
async function mixVoiceWithMusic(voiceBuffer, musicStyle = 'calm', tone = 'energizing') {
  const tmpDir    = os.tmpdir();
  const voiceFile = path.join(tmpDir, `voice_${Date.now()}.mp3`);
  const outFile   = path.join(tmpDir, `mixed_${Date.now()}.mp3`);

  try {
    fs.writeFileSync(voiceFile, voiceBuffer);

    const profileKey = `${musicStyle}_${tone}`;
    const musicFilter = MUSIC_PROFILES[profileKey] || MUSIC_PROFILES.calm_calming;

    // Build FFmpeg command:
    // 1. Input: voice file
    // 2. Generate background music via lavfi matching voice duration
    // 3. Mix with amix, voice at full volume, music at its preset level
    // 4. Apply slight fade in/out and normalize
    const args = [
      '-i', voiceFile,
      '-f', 'lavfi', '-i', musicFilter,
      '-filter_complex',
      '[0:a]volume=1.0[voice];[1:a]afade=t=in:st=0:d=2,afade=t=out:st=-2:d=2[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[out]',
      '-map', '[out]',
      '-codec:a', 'libmp3lame',
      '-q:a', '2',       // high quality VBR
      '-y',
      outFile,
    ];

    await execFileAsync('ffmpeg', args, { timeout: 120_000 });

    const result = fs.readFileSync(outFile);
    return result;
  } finally {
    try { fs.unlinkSync(voiceFile); } catch {}
    try { fs.unlinkSync(outFile);  } catch {}
  }
}

/**
 * Check if FFmpeg is available on the system.
 */
async function isFFmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

module.exports = { mixVoiceWithMusic, isFFmpegAvailable };
