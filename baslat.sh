#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
[ -d node_modules ] || npm install
printf 'Klinik Meta CRM başlatılıyor: http://localhost:3001\n'
npm start
