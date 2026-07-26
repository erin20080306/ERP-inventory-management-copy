#!/bin/sh
set -eu

PRISMA_BIN="/app/node_modules/.bin/prisma"
TSX_BIN="/app/node_modules/.bin/tsx"

echo "同步本機資料庫結構…"
"$PRISMA_BIN" migrate deploy

USER_COUNT="$(node -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.user.count().then(n=>process.stdout.write(String(n))).finally(()=>p.$disconnect())')"
if [ "$USER_COUNT" = "0" ]; then
  echo "建立第一個公司與管理員…"
  "$TSX_BIN" prisma/seed.ts
fi

echo "ERP／POS 已啟動：${NEXTAUTH_URL}"
exec node /app/server.js
