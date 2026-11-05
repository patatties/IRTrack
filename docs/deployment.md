# Deployment (Docker)

One image, one process: Bun serves the web app and the REST API, and stores everything in a SQLite file on the `/data` volume. No separate database container is needed.

## Build and run

```bash
docker compose up --build
# open http://localhost:8080
```

Or without compose — mount a volume so data survives container rebuilds:

```bash
docker build -t irtrack .
docker run -p 8080:3000 -v irtrack-data:/data irtrack
```

On first start an empty database is created and the app opens the setup wizard (`/setup`), which walks you through filling it, with templates to choose from at every step.

## Backup

The data is the single file `/data/irtrack.db` (plus `-wal`/`-shm` files while running). Safest is an online backup:

```bash
docker compose exec irtrack bun -e "new (require('bun:sqlite').Database)('/data/irtrack.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp irtrack:/data/backup.db ./irtrack-backup.db
```

## How it works

- `Dockerfile` — build stage: `bun run build` builds the web app (Vite, static SPA into `dist/`), then `bun run build:server` bundles `server/` into one file. Runtime stage: `oven/bun:1-slim`, runs as user `bun`, health check on `/api/health`.
- `server/index.ts` — `/api/*` goes to the API; other paths serve files from `/app/public`, unknown paths get `index.html` (SPA fallback). Hashed `/assets/` are cached for a year.
- Configuration: see `docs/configuration.md`.

## Local development

```bash
bun install
bun run server   # API + SQLite on http://localhost:3000 (./data/irtrack.db)
bun run dev      # web app on http://localhost:8080, proxies /api to :3000
```
