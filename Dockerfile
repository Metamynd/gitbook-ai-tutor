# Multi-stage build using Next's standalone output (next.config.mjs) — the
# runtime image only needs server.js + the traced node_modules subset, not
# the full source tree or devDependencies.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL etc. aren't needed at build time (no static DB access during
# build) — only real secrets are supplied at runtime via .env.production.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Not part of the Next.js app bundle Next's own tracing follows, so the
# standalone copy above misses them — deploy.yml runs db-push.mjs inside
# this same container after a fresh deploy. `pg` itself IS already traced
# in (the app imports it via db/client.ts).
COPY --from=builder --chown=nextjs:nodejs /app/scripts/db-push.mjs ./scripts/db-push.mjs
COPY --from=builder --chown=nextjs:nodejs /app/db/schema/schema.sql ./db/schema/schema.sql
# content/prompts/*.md and learning-paths/*.json are read via fs.readFileSync
# at request time (tutor-core/conversation/context.ts,
# tutor-core/learning/learning-paths.ts), not imported — Next's standalone
# tracing only follows static imports, so it silently omits these. Missing
# this caused every real chat message to fail after retrieval succeeded
# (ENOENT reading the system prompt), caught by actually sending a message
# against a running container instead of trusting a green build.
COPY --from=builder --chown=nextjs:nodejs /app/content ./content

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
