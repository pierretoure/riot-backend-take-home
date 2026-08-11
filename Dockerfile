# syntax=docker/dockerfile:1

# ---- base --------------------------------------------------------------
# Shared base: pins the exact pnpm version required by the project via
# corepack, so every stage below installs/builds with the same tool.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

# ---- deps ----------------------------------------------------------------
# Installs *all* dependencies (incl. devDependencies) needed to compile the
# project. Manifests are copied first so this layer is cached as long as
# package.json/pnpm-lock.yaml don't change.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build -----------------------------------------------------------------
# Compiles TypeScript to dist/ using the full dependency set from `deps`.
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# ---- prod-deps -------------------------------------------------------------
# Separate, from-scratch install of *production-only* dependencies, so the
# runtime image never inherits jest/typescript/eslint/etc. from `deps`.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- runtime -----------------------------------------------------------
# Minimal final image: compiled output + production node_modules only.
# No source, no devDependencies, no secrets baked in.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Dedicated non-root user, created before files are copied so ownership is
# correct from the start (avoids a costly recursive chown layer).
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp

COPY --from=prod-deps --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodeapp /app/dist ./dist
COPY --chown=nodeapp:nodeapp package.json ./package.json

USER nodeapp

EXPOSE 3000

# SIGNER_SECRET (and any other configuration) must be supplied at runtime via
# the environment / docker-compose `.env`, never baked into the image.

# Uses `node -e` rather than curl/wget: alpine/slim Node images don't ship
# either tool, and adding one would mean an extra installed package purely
# for the healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('node:http');const port=process.env.PORT||3000;const req=http.get({host:'127.0.0.1',port,path:'/health',timeout:2000},(res)=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1)})"

CMD ["node", "dist/main.js"]
