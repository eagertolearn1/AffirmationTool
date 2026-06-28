@echo off
echo Starting AuraLoop Frontend (Next.js)...
cd /d "%~dp0frontend"
start "AuraLoop Frontend" cmd /k "npm run dev"
echo Frontend starting at http://localhost:3000
echo This window will close. A new window with the server will open.
timeout /t 3
