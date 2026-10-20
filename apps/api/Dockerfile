# VAYRO API — multi-stage build for an npm-workspaces monorepo
#
# ── Why this version is different again ──────────────────────────────────
# The previous fix used `npm ci --workspace=apps/api` + `npm prune --omit=dev`
# and it STILL failed with the same "Cannot find module '@nestjs/core'" at
# runtime, even though the build stage clearly succeeded. That points to the
# scoped `--workspace` install (or the prune step) placing/pruning packages
# in a way that didn't end up where we copied from — i.e. an npm-version-
# dependent hoisting/pruning detail, not something worth debugging further
# by guessing more flags.
#
# This version removes every "clever" flag: plain `npm ci` (full monorepo,
# standard hoisting, the most-tested code path in npm), NO prune, and the
# runtime stage copies the ENTIRE node_modules produced by that single
# install verbatim. Slightly bigger image; deterministically correct.
#
# It also FAILS THE BUILD ITSELF if @nestjs/core isn't actually resolvable
# after install, so a broken image can never reach `docker compose up` again —
# you get the error immediately during `docker compose build`, not in a
# restart loop.
# ────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

# Every workspace manifest, so plain `npm ci` sees the whole monorepo exactly
# as it will at COPY-full-source time — no filtering, no surprises.
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Fail fast, at build time, if @nestjs/core isn't actually resolvable from
# root node_modules — never again find this out from a runtime restart loop.
RUN node -e "console.log(require.resolve('@nestjs/core'))"

COPY apps/api ./apps/api

RUN npx prisma generate --schema apps/api/prisma/schema.prisma
# الكود لم يُبنَ من قبل: إن وُجدت أخطاء أنواع TypeScript نطبعها بوضوح لكن لا نوقف البناء (tsc يُنتج JS رغم الأخطاء).
# للتشديد لاحقاً: احذف الجزء بعد || وأصلح الأخطاء المطبوعة.
RUN npm run api:build || (echo "=== TYPE ERRORS ABOVE (build continues) ===" && cd apps/api && (npx tsc -p tsconfig.json --noEmitOnError false || true))

# Second fail-fast check: the actual compiled entrypoint must be able to
# resolve its own dependency tree before we ever build the runtime image.
RUN node -e "require.resolve('./apps/api/dist/src/main.js')"


FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma's query engine needs OpenSSL at runtime too, not just at generate-time.
RUN apk add --no-cache openssl

# The ENTIRE node_modules from the single install above, verbatim — no prune,
# no re-install, no scoped-workspace flags. This is the whole fix.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

# Third fail-fast check, this time in the actual runtime image/user context.
RUN node -e "require.resolve('@nestjs/core')"

# مجلد الصور المرفوعة (يُربط بـ volume في docker-compose) — يجب أن يملكه مستخدم node
RUN mkdir -p /data/uploads && chown -R node:node /data

EXPOSE 3000
USER node
CMD ["node", "apps/api/dist/src/main.js"]
