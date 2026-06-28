@echo off
echo ============================================
echo  AuraLoop - Initial Git Push
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
git add -f backend\.env 2>nul
echo.

echo [4/6] Creating commit...
git commit -m "Initial commit: AuraLoop 21-Day Identity Transformation Platform"
echo.

echo [5/6] Adding remote...
git remote remove origin 2>nul
git remote add origin https://github.com/eagertolearn1/AffirmationTool.git
git branch -M main
echo.

echo [6/6] Pushing to GitHub...
git push -u origin main

echo.
echo ============================================
echo  Done! View at: https://github.com/eagertolearn1/AffirmationTool
echo ============================================
pause
