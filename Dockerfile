# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

FROM base AS production-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
      timeout 600 npm ci --omit=dev --ignore-scripts --prefer-offline --no-audit --no-fund --fetch-retries=1 --fetch-timeout=60000 && exit 0; \
      rm -rf node_modules; \
      echo "production npm ci attempt ${attempt} failed; retrying." >&2; \
    done; \
    exit 1

FROM base AS runtime-tools
WORKDIR /tools
RUN --mount=type=cache,target=/root/.npm \
    printf '{"private":true}\n' > package.json \
    && npm install --no-audit --no-fund prisma@5.22.0 tsx@4.19.2

FROM production-deps AS runtime-deps
COPY --from=runtime-tools /tools/node_modules ./node_modules
RUN npx prisma generate

FROM base AS build
ARG ERIN_RELEASE_SHA=development
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
      timeout 600 npm ci --prefer-offline --no-audit --no-fund --fetch-retries=1 --fetch-timeout=60000 && exit 0; \
      rm -rf node_modules; \
      echo "build npm ci attempt ${attempt} failed; retrying with the preserved package cache." >&2; \
    done; \
    exit 1
COPY . .
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/erp?schema=public"
ENV NEXTAUTH_SECRET="docker-build-only-secret-not-used-at-runtime"
ENV ERIN_RELEASE_SHA=$ERIN_RELEASE_SHA
RUN npm run build && rm -rf .next/cache

FROM node:20-alpine AS runtime
ARG ERIN_RELEASE_SHA=development
WORKDIR /app
ENV NODE_ENV=production
ENV ERIN_RELEASE_SHA=$ERIN_RELEASE_SHA
LABEL org.opencontainers.image.revision=$ERIN_RELEASE_SHA
RUN apk add --no-cache openssl libc6-compat postgresql-client

COPY package.json package-lock.json next.config.js ./
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/docker ./docker

RUN chmod +x /app/docker/entrypoint.sh /app/docker/backup-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
