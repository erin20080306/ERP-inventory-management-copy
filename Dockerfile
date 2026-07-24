FROM node:20-alpine AS build
ARG ERIN_RELEASE_SHA=development
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat postgresql-client
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
RUN npm run build

FROM node:20-alpine AS runtime
ARG ERIN_RELEASE_SHA=development
WORKDIR /app
ENV NODE_ENV=production
ENV ERIN_RELEASE_SHA=$ERIN_RELEASE_SHA
LABEL org.opencontainers.image.revision=$ERIN_RELEASE_SHA
RUN apk add --no-cache openssl libc6-compat postgresql-client
COPY --from=build /app ./
RUN chmod +x /app/docker/entrypoint.sh /app/docker/backup-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
