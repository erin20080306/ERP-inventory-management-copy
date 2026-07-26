# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

FROM base AS build
ARG ERIN_RELEASE_SHA=development
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/erp?schema=public"
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,id=erp-build-npm,target=/root/.npm,sharing=locked \
    for attempt in 1 2 3; do \
      timeout 600 npm ci --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=1 --fetch-timeout=60000 && exit 0; \
      rm -rf node_modules; \
      echo "npm ci attempt ${attempt} failed; retrying with the preserved package cache." >&2; \
    done; \
    exit 1
RUN npx prisma generate
COPY . .
ENV NEXTAUTH_SECRET="docker-build-only-secret-not-used-at-runtime"
ENV ERIN_RELEASE_SHA=$ERIN_RELEASE_SHA
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && rm -rf .next/cache

FROM base AS runtime-tools
WORKDIR /tools
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
RUN --mount=type=cache,id=erp-runtime-tools-npm,target=/root/.npm,sharing=locked \
    npm init -y >/dev/null 2>&1 && \
    npm install --omit=dev --no-package-lock --no-audit --no-fund \
      @prisma/client@5.22.0 bcryptjs@2.4.3 prisma@5.22.0 tsx@4.19.2

FROM base AS runtime
ARG ERIN_RELEASE_SHA=development
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV ERIN_RELEASE_SHA=$ERIN_RELEASE_SHA
LABEL org.opencontainers.image.revision=$ERIN_RELEASE_SHA
RUN apk add --no-cache postgresql-client

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Keep operational CLI dependencies outside the standalone dependency tree.
# Only copy the two seed-time application packages and expose stable CLI links.
COPY --from=runtime-tools /tools /tools
COPY --from=runtime-tools /tools/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=runtime-tools /tools/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=build /app/prisma ./prisma
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/scripts/create-encrypted-backup.ts ./scripts/create-encrypted-backup.ts
COPY --from=build /app/docker ./docker
RUN mkdir -p /app/node_modules/.bin && \
    ln -sf /tools/node_modules/.bin/prisma /app/node_modules/.bin/prisma && \
    ln -sf /tools/node_modules/.bin/tsx /app/node_modules/.bin/tsx && \
    test -f /app/server.js && \
    test -x /app/node_modules/.bin/prisma && \
    test -x /app/node_modules/.bin/tsx && \
    node -e 'require.resolve("@prisma/client"); require.resolve("bcryptjs")' && \
    chmod +x /app/docker/entrypoint.sh /app/docker/backup-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
