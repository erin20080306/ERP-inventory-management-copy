# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

FROM base AS build
ARG ERIN_RELEASE_SHA=development
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
      timeout 600 npm ci --prefer-offline --fetch-retries=1 --fetch-timeout=60000 && exit 0; \
      rm -rf node_modules; \
      echo "npm ci attempt ${attempt} failed; retrying with the preserved package cache." >&2; \
    done; \
    exit 1
COPY . .
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/erp?schema=public"
ENV NEXTAUTH_SECRET="docker-build-only-secret-not-used-at-runtime"
ENV ERIN_RELEASE_SHA=$ERIN_RELEASE_SHA
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && rm -rf .next/cache

FROM base AS production-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --prefer-offline --fetch-retries=1 --fetch-timeout=60000 && \
    npm cache clean --force

FROM base AS runtime-tools
WORKDIR /tools
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --no-package-lock --no-audit --no-fund \
      prisma@5.22.0 tsx@4.19.2 && \
    npm cache clean --force

FROM base AS runtime
ARG ERIN_RELEASE_SHA=development
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV ERIN_RELEASE_SHA=$ERIN_RELEASE_SHA
LABEL org.opencontainers.image.revision=$ERIN_RELEASE_SHA
RUN apk add --no-cache postgresql-client

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=runtime-tools /tools/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/scripts/create-encrypted-backup.ts ./scripts/create-encrypted-backup.ts
COPY --from=build /app/docker ./docker
RUN chmod +x /app/docker/entrypoint.sh /app/docker/backup-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
