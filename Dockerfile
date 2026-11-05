# IRTrack — self-hosted image: one Bun process serves the web app and the REST API (/api),
# with all data in a SQLite file on the /data volume.

# ---- Build stage ----
# Runs on the build machine's own platform: the output (static web app + bundled JavaScript) works on
# every platform, so multi-platform builds (amd64 + arm64) only repeat the small runtime stage.
FROM --platform=$BUILDPLATFORM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .
# Web app (static SPA into dist/) and the server (server/ + shared domain code) bundled into one file.
RUN bun run build && bun run build:server

# ---- Runtime stage ----
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/dist-server/server.js ./server.js
COPY --from=build /app/dist ./public

ENV NODE_ENV=production \
    PORT=3000 \
    IRTRACK_DB=/data/irtrack.db \
    IRTRACK_STATIC=/app/public

RUN mkdir -p /data && chown bun:bun /data
VOLUME /data
USER bun

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "server.js"]
