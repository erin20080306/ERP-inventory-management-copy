#!/bin/sh
set -eu

echo "同步本機資料庫結構…"
npx prisma migrate deploy

USER_COUNT="$(node -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.user.count().then(n=>process.stdout.write(String(n))).finally(()=>p.$disconnect())')"
if [ "$USER_COUNT" = "0" ]; then
  echo "建立第一個公司與管理員…"
  npm run db:seed
fi

echo "ERP／POS 已啟動：${NEXTAUTH_URL}"
exec npm start -- -H 0.0.0.0
