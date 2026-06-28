@echo off
echo ============================================
echo  AuraLoop - Rebuilding + Generating Content
echo  Step 1: Rebuild backend (picks up ElevenLabs fix)
echo  Step 2: Reset old 3-second audio in DB
echo  Step 3: Regenerate all 21-day audio (ElevenLabs)
echo  Total time: 20-30 minutes. Don't close!
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] Rebuilding backend container...
docker compose up -d --build backend
echo.

echo Waiting 25 seconds for container to become healthy...
timeout /t 25 /nobreak
echo.

echo [2/3] Resetting old audio paths so regeneration is forced...
docker compose exec -T postgres psql -U appuser -d identity_platform -c "UPDATE affirmation_days SET morning_audio_path = NULL, evening_audio_path = NULL, audio_status = 'pending' WHERE journey_id = 'd361d516-df76-457d-92bc-428d41f8bc57';"
echo.

echo [3/3] Generating content + audio with ElevenLabs (this takes 20-25 min)...
docker compose exec -T backend node scripts/generate-content.js

echo.
echo ============================================
echo  Done! Press any key to close.
echo ============================================
pause
