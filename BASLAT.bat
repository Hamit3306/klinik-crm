@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo Gerekli paketler kuruluyor...
  call npm install
)
echo Cloudflare Tunnel baslatiliyor (yourdomain.com)...
start "Cloudflare Tunnel" /min cloudflared.exe tunnel run --url http://localhost:3001 klinik-crm
echo Klinik Meta CRM baslatiliyor...
start "" https://yourdomain.com
node server.js
pause
