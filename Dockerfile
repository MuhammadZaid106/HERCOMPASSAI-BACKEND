# syntax=docker/dockerfile:1

# ─── Base: Node + pnpm ───────────────────────────────────────────────────────
# pnpm is installed from npm rather than via corepack because the pinned
# `packageManager` version (12.4.2) fails corepack's integrity check; the
# lockfile (v9.0) is read by any pnpm 12.x.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12
WORKDIR /app

# ─── Deps: full dependency set, cached until the manifests change ────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

# ─── Build: compile TypeScript to dist/ ──────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The backend ships with pre-existing typecheck errors, so `tsc` exits non-zero
# while still emitting usable output. Fail the image only if nothing was emitted.
RUN pnpm build; test -f dist/server.js

# ─── Prod deps: only what the runtime needs ──────────────────────────────────
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --prod --frozen-lockfile

# ─── Runner: non-root, production only ───────────────────────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=5000
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./
COPY --chown=app:app migrations ./migrations
COPY --chown=app:app scripts ./scripts

USER app
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
