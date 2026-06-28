@echo off
echo ============================================
echo  AuraLoop - Initial Git Push
echo  Remote: https://github.com/eagertolearn1/AffirmationTool
echo ============================================
echo.

cd /d "%~dp0"

echo [1/6] Removing stale git lock (if any)...
if exist ".git\index.lock" del /f ".git\index.lock"
echo.

echo [2/6] Configuring git identity...
git config user.email "chitwanarora@gmail.com"
git config user.name "Chitwan Arora"
echo.

echo [3/6] Staging all files (including .env)...
git add -A
git add -f backend\.env
git add -f frontend\.env.local 2>nul
echo.

echo [4/6] Creating initial commit...
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
- 21-day journey: doubt reframe, truth affirmation, action prompts
- All API keys included for deployment"

echo.

echo [5/6] Adding remote...
git remote remove origin 2>nul
git remote add origin https://github.com/eagertolearn1/AffirmationTool.git
git branch -M main
echo.

echo [6/6] Pushing to GitHub...
echo NOTE: If prompted, enter your GitHub username + Personal Access Token (not password)
echo Get a token at: https://github.com/settings/tokens (check 'repo' scope)
echo.
git push -u origin main

echo.
echo ============================================
echo  Done! View at: https://github.com/eagertolearn1/AffirmationTool
echo ============================================
pause
