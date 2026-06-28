@echo off
echo ============================================
echo  AuraLoop - Initial Git Push
echo  Remote: https://github.com/eagertolearn1/AffirmationTool
echo ============================================
echo.

cd /d "%~dp0"

echo [1/5] Removing stale git lock (if any)...
if exist ".git\index.lock" del /f ".git\index.lock"
echo.

echo [2/5] Configuring git identity...
git config user.email "chitwanarora@gmail.com"
git config user.name "Chitwan Arora"
echo.

echo [3/5] Staging all files...
git add -A
echo.

echo [4/5] Creating initial commit...
git commit -m "Initial commit: AuraLoop 21-Day Identity Transformation Platform

- Express.js REST API + PostgreSQL + BullMQ + Docker Compose
- Next.js 15 App Router PWA frontend
- ElevenLabs TTS (EN/HI) + Sarvam AI (regional languages)
- Bannerbear infographic/progress/badge cards
- Cloudflare R2 storage
- Razorpay payment integration
- WhatsApp Business (Interakt) scheduling + reminders
- AI coaching with daily limits + credit top-ups
- DPDPA 2023 compliant (data export + right to erasure)
- 21-day journey: doubt reframe, truth affirmation, action prompts"

echo.

echo [5/5] Adding remote and pushing...
git remote add origin https://github.com/eagertolearn1/AffirmationTool.git
git branch -M main
git push -u origin main

echo.
echo ============================================
echo  Done! Check: https://github.com/eagertolearn1/AffirmationTool
echo ============================================
pause
