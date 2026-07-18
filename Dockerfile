FROM node:20-alpine AS build
ARG ERIN_RELEASE_SHA=development
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat postgresql-client
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
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
