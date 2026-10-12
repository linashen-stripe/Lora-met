# Install dependencies only when needed
FROM node:24.11.1-alpine AS base

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat git openssh-client

WORKDIR /app

COPY package.json package-lock.json ./

RUN --mount=type=secret,id=github_token \
    GH_TOKEN=$(cat /run/secrets/github_token) && \
    git config --global url."https://x-access-token:${GH_TOKEN}@github.com/stripe-demos/".insteadOf "https://github.com/stripe-demos/" && \
    npm install && \
    git config --global --unset-all url."https://x-access-token:${GH_TOKEN}@github.com/stripe-demos/".insteadOf

# Rebuild the source code only when needed
FROM base AS builder

WORKDIR /app

COPY . .

RUN apk add openssl
RUN echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# You only need to copy next.config.js if you are NOT using the default configuration
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.env ./.env

USER nextjs

EXPOSE 4567

ENV PORT=4567

# Disable Next.js telemetry. Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["node_modules/.bin/next", "start"]
