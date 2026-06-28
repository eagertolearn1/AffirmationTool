/**
 * generate-content.js
 *
 * Run this INSIDE the backend Docker container:
 *   docker exec -it auraloop-backend node /app/scripts/generate-content.js
 *
 * It will:
 *   1. Generate 21-day affirmation content for the journey via OpenAI
 *   2. Generate morning + evening audio for all 21 days via OpenAI TTS
 *   3. Upload audio to Cloudflare R2
 *   4. Update all DB records
 *
 * Configure JOURNEY_ID below (or pass as env var).
 */

const JOURNEY_ID = process.env.JOURNEY_ID || 'd361d516-df76-457d-92bc-428d41f8bc57';
const START_DAY  = parseInt(process.env.START_DAY  || '1', 10);
const SKIP_AUDIO = process.env.SKIP_AUDIO === 'true';

// ─── load services ────────────────────────────────────────────
const path = require('path');
const ROOT  = path.join(__dirname, '..');

const db      = require(path.join(ROOT, 'src/db'));
const ai      = require(path.join(ROOT, 'src/services/ai'));
const tts     = require(path.join(ROOT, 'src/services/tts'));
const storage = require(path.join(ROOT, 'src/services/storage'));

async function run() {
  console.log(`\n🚀 AuraLoop Content Generator`);
  console.log(`   Journey: ${JOURNEY_ID}`);
  console.log(`   Start day: ${START_DAY}`);
  console.log(`   Skip audio: ${SKIP_AUDIO}\n`);

  // ── 1. Fetch journey details ───────────────────────────────
  const { rows: [journey] } = await db.query(
    `SELECT id, track, language, tier, status,
            problem_statement, goal_statement,
            inner_voice_belief, identity_shift_needed, core_belief_to_change,
            calibration_data, voice_clone_id, music_style
     FROM journeys WHERE id = $1`,
    [JOURNEY_ID]
  );

  if (!journey) {
    console.error('❌ Journey not found:', JOURNEY_ID);
    process.exit(1);
  }

  console.log(`📋 Journey details:`);
  console.log(`   Track:    ${journey.track}`);
  console.log(`   Language: ${journey.language || 'en'}`);
  console.log(`   Tier:     ${journey.tier}`);
  console.log(`   Status:   ${journey.status}\n`);

  // ── 2. Check existing content ──────────────────────────────
  const { rows: existingDays } = await db.query(
    `SELECT day_number, truth_statement, content_status, audio_status
     FROM affirmation_days WHERE journey_id = $1 ORDER BY day_number`,
    [JOURNEY_ID]
  );

  const existingWithContent = existingDays.filter(d =>
    d.truth_statement && d.truth_statement.trim().length > 20
  );
  console.log(`📦 Existing content: ${existingWithContent.length}/21 days have content`);

  // ── 3. Generate content for missing days ──────────────────
  const daysNeedingContent = [];
  for (let d = START_DAY; d <= 21; d++) {
    const existing = existingDays.find(e => e.day_number === d);
    if (!existing || !existing.truth_statement || existing.truth_statement.trim().length < 20) {
      daysNeedingContent.push(d);
    }
  }

  if (daysNeedingContent.length > 0) {
    console.log(`\n✍️  Generating AI content for days: ${daysNeedingContent.join(', ')}`);
    console.log('   (This calls OpenAI GPT-4o — takes ~30s)\n');

    try {
      const allDays = await ai.generateAffirmationArc({
        track:                journey.track || 'confidence',
        language:             journey.language || 'en',
        problem_statement:    journey.problem_statement || 'I struggle with self-doubt and lack of confidence',
        goal_statement:       journey.goal_statement   || 'I want to feel genuinely confident in who I am',
        inner_voice_belief:   journey.inner_voice_belief || 'I am not good enough',
        identity_shift_needed:journey.identity_shift_needed || 'From doubter to confident leader',
        core_belief_to_change:journey.core_belief_to_change || 'I am not enough',
        calibration_data:     journey.calibration_data || {},
      });

      console.log(`✅ Generated ${allDays.length} days of content from OpenAI`);

      // Save only the days we need
      for (const day of allDays) {
        if (!daysNeedingContent.includes(day.day_number)) continue;

        await db.query(
          `INSERT INTO affirmation_days
             (journey_id, day_number, doubt, reframe, truth_statement, action_prompt, content_status)
           VALUES ($1, $2, $3, $4, $5, $6, 'ready')
           ON CONFLICT (journey_id, day_number)
           DO UPDATE SET
             doubt = $3, reframe = $4, truth_statement = $5, action_prompt = $6, content_status = 'ready',
             updated_at = NOW()`,
          [JOURNEY_ID, day.day_number, day.doubt, day.reframe, day.truth_statement, day.action_prompt]
        );
        console.log(`   ✓ Day ${day.day_number}: ${day.truth_statement.substring(0, 60)}…`);
      }
    } catch (err) {
      console.error('❌ Content generation failed:', err.message);
      console.log('   Continuing with audio for days that already have content…\n');
    }
  } else {
    console.log('✅ All days already have content — skipping content generation\n');
  }

  if (SKIP_AUDIO) {
    console.log('\n⏭️  SKIP_AUDIO=true — skipping TTS generation');
    await db.end();
    return;
  }

  // ── 4. Generate audio for all days ────────────────────────
  console.log(`\n🎙️  Generating audio for days ${START_DAY}–21…`);
  console.log('   Morning voice: nova (energizing)');
  console.log('   Evening voice: shimmer (calming)\n');

  // Re-fetch content (may have just been generated)
  const { rows: contentDays } = await db.query(
    `SELECT day_number, doubt, reframe, truth_statement, action_prompt,
            morning_audio_path, evening_audio_path, audio_status
     FROM affirmation_days WHERE journey_id = $1 ORDER BY day_number`,
    [JOURNEY_ID]
  );

  let audioOk = 0, audioSkipped = 0, audioFailed = 0;

  for (let dayNum = START_DAY; dayNum <= 21; dayNum++) {
    const content = contentDays.find(d => d.day_number === dayNum);

    if (!content || !content.truth_statement || content.truth_statement.trim().length < 10) {
      console.log(`   ⚠️  Day ${dayNum}: no content — skipping`);
      audioSkipped++;
      continue;
    }

    // Skip if audio already exists
    if (content.morning_audio_path && content.evening_audio_path && content.audio_status === 'ready') {
      console.log(`   ✓  Day ${dayNum}: audio already exists — skipping`);
      audioSkipped++;
      continue;
    }

    process.stdout.write(`   Day ${dayNum}: generating full script + audio…`);

    let morningPath = content.morning_audio_path || null;
    let eveningPath = content.evening_audio_path || null;
    const dayContent = {
      day_number:      dayNum,
      doubt:           content.doubt,
      reframe:         content.reframe,
      truth_statement: content.truth_statement,
      action_prompt:   content.action_prompt,
    };

    try {
      if (!morningPath) {
        const buf = await tts.generateFullAudio(dayContent, journey.language || 'en', 'energizing', journey.music_style || 'calm', journey.track || 'confidence');
        morningPath = storage.assetPath(JOURNEY_ID, dayNum, 'morning.mp3');
        await storage.uploadFile(morningPath, buf, 'audio/mpeg');
      }

      if (!eveningPath) {
        const buf = await tts.generateFullAudio(dayContent, journey.language || 'en', 'calming', journey.music_style || 'calm', journey.track || 'confidence');
        eveningPath = storage.assetPath(JOURNEY_ID, dayNum, 'evening.mp3');
        await storage.uploadFile(eveningPath, buf, 'audio/mpeg');
      }

      await db.query(
        `UPDATE affirmation_days
         SET morning_audio_path = $1, evening_audio_path = $2,
             audio_status = 'ready'::generation_status, updated_at = NOW()
         WHERE journey_id = $3 AND day_number = $4`,
        [morningPath, eveningPath, JOURNEY_ID, dayNum]
      );

      console.log(` ✅`);
      audioOk++;
    } catch (err) {
      console.log(` ❌ ${err.message}`);
      audioFailed++;
    }

    // Delay between days to avoid OpenAI rate limits
    await sleep(3000);
  }

  console.log(`\n📊 Audio summary: ${audioOk} generated, ${audioSkipped} skipped, ${audioFailed} failed`);

  // ── 5. Mark journey active ─────────────────────────────────
  const { rows: [updated] } = await db.query(
    `UPDATE journeys
     SET status = 'active',
         calendar_started_at = COALESCE(calendar_started_at, NOW()),
         current_affirmation_day = GREATEST(COALESCE(current_affirmation_day, 0), 1),
         current_calendar_day    = GREATEST(COALESCE(current_calendar_day, 0), 1),
         updated_at = NOW()
     WHERE id = $1
     RETURNING status, current_affirmation_day`,
    [JOURNEY_ID]
  );
  console.log(`\n🎯 Journey status: ${updated.status} (day ${updated.current_affirmation_day})`);

  // ── 6. Ensure Day 1 session is unlocked ──────────────────
  await db.query(
    `INSERT INTO daily_sessions (journey_id, affirmation_day_number, calendar_date, state)
     VALUES ($1, 1, CURRENT_DATE, 'morning_unlocked')
     ON CONFLICT (journey_id, affirmation_day_number)
     DO UPDATE SET state = 'morning_unlocked', updated_at = NOW()`,
    [JOURNEY_ID]
  );
  console.log('✅ Day 1 session confirmed: morning_unlocked');

  console.log('\n🏁 Done! Your 21-day journey content is ready.\n');
  await db.pool?.end().catch(() => {});  // graceful pool shutdown (optional)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
