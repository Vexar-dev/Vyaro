# VAYRO Web (Next.js) — يُبنى من جذر المشروع (context = ..)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY apps/web ./apps/web
# القيمة تُدمَج وقت البناء. /api/v1 = نفس الأصل عبر Caddy (لا CORS ولا مشاكل كوكيز).
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG SKIP_TYPECHECK=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL SKIP_TYPECHECK=$SKIP_TYPECHECK NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=apps/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web ./apps/web
WORKDIR /app/apps/web
EXPOSE 3001
USER node
CMD ["node", "../../node_modules/next/dist/bin/next", "start", "-p", "3001"]
