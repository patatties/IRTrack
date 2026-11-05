# IRTrack

Open-source incident response management. IRTrack takes in the incident flow from service desks (TOPdesk, ServiceNow, Jira SM, CSV, webhooks), shows it on one dashboard, and adds guidance and coordination when incidents escalate — across IT, security, privacy, facilities, safety, HR and continuity.

- **User Portal** (`/`, the start page): "What are you seeing?", situation guidance with interactive flowcharts, the escalation ladder of contacts, roles, a 5-step report wizard and status tracking.
- **Admin Console** (`/admin`): dashboard, wallboard, executive view, incidents with playbooks, reporting obligations, guidance + flowchart builder, contacts, roles & RACI, processes, sources, reports and settings.
- **REST API** (`/api`) and **MCP server** (`/mcp`) for integrations and AI assistants.

Everything runs in one Docker container: a Bun server with the web app, the API, the MCP server and a SQLite database on a volume.

## Installation (Docker Hub)

IRTrack is published on Docker Hub as [`patatties/irtrack`](https://hub.docker.com/r/patatties/irtrack) for `linux/amd64` and `linux/arm64` (also Raspberry Pi, ARM-based NAS and Apple Silicon). You only need Docker; no source code and no database server. All data is stored in a SQLite file in a volume mounted at `/data`.

|          |                                                                                   |
| -------- | --------------------------------------------------------------------------------- |
| Image    | `patatties/irtrack:latest` (every change on `main` is published as `:latest`)     |
| Port     | the app listens on `3000` inside the container; the examples publish it as `8080` |
| Data     | volume at `/data` with the database `irtrack.db`                                  |
| Settings | environment variables, see [Configuration](#configuration-env) — all optional     |

### Option 1 — `docker run`

```bash
docker run -d --name irtrack \
  -p 8080:3000 \
  -v irtrack-data:/data \
  --restart unless-stopped \
  patatties/irtrack:latest
```

Open http://localhost:8080; a new installation starts with the [setup page](#first-start-three-ways-to-fill-irtrack).

With settings, add `-e NAME=value` per variable, or put them in a `.env` file and add `--env-file .env`:

```bash
docker run -d --name irtrack \
  -p 8080:3000 \
  -v irtrack-data:/data \
  -e IRTRACK_MCP_TOKEN=a-long-random-string \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  --restart unless-stopped \
  patatties/irtrack:latest
```

### Option 2 — Docker Compose (recommended)

1. Create a folder (e.g. `irtrack`) with a file `compose.yaml`:

   ```yaml
   services:
     irtrack:
       image: patatties/irtrack:latest
       container_name: irtrack
       ports:
         - "8080:3000"
       env_file: .env # settings: AI providers, MCP token …
       volumes:
         - irtrack-data:/data # SQLite database (irtrack.db); back up this volume
       extra_hosts:
         - "host.docker.internal:host-gateway" # only needed for Ollama on this machine
       restart: unless-stopped

   volumes:
     irtrack-data:
   ```

2. Next to it, create the settings file `.env`. Start from the template, or leave it empty for the defaults:

   ```bash
   curl -o .env https://raw.githubusercontent.com/patatties/IRTrack/main/.env.example
   ```

3. Start it:

   ```bash
   docker compose up -d
   docker compose ps          # STATUS shows "healthy" after a few seconds
   docker compose logs -f     # startup log: MCP mode, database and setup status
   ```

   Open http://localhost:8080.

### Updating, stopping and removing

|                                           | Docker Compose                                 | `docker run`                                                                                                    |
| ----------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Update to the latest version              | `docker compose pull && docker compose up -d`  | `docker pull patatties/irtrack:latest`, then `docker rm -f irtrack` and run the same `docker run` command again |
| Logs                                      | `docker compose logs -f`                       | `docker logs -f irtrack`                                                                                        |
| Stop / start                              | `docker compose stop` / `docker compose start` | `docker stop irtrack` / `docker start irtrack`                                                                  |
| Remove the container, keep the data       | `docker compose down`                          | `docker rm -f irtrack`                                                                                          |
| Remove everything, **including all data** | `docker compose down -v`                       | `docker rm -f irtrack && docker volume rm irtrack-data`                                                         |

Your data lives in the volume, so updating or recreating the container keeps it. Changed settings in `.env` take effect after `docker compose up -d` (a plain `restart` does not reload them).

### Building from source

```bash
git clone https://github.com/patatties/IRTrack.git && cd IRTrack
cp .env.example .env
docker compose up -d --build     # uses docker-compose.yml from the repository
```

## First start: three ways to fill IRTrack

A new database is empty. Until setup is done, every page opens the setup page, where you choose:

1. **Set up my organization** — a step-by-step wizard: organization, master data, contacts, roles, reporting obligations, processes, guidance and sources. Every step offers templates to choose from, and every step can be skipped.
2. **Let AI set it up** — add your own documents (contact lists, crisis plan, organization chart …) as PDF, Word, Excel, PowerPoint, images or text, and/or paste text. An AI model proposes where everything belongs: organization details, master data, contacts on the escalation ladder, roles, and which templates fit. You review the proposal and untick what you do not want; nothing is saved until you click _Apply_. Saving goes through IRTrack's own MCP server (loopback), so every AI setup also tests MCP. Needs an AI provider in `.env` (see below).
3. **Explore with demo data** — fills the database with the fictional "Northshore Municipality" (about 2,500 incidents and 7 live scenarios). For trying IRTrack out, not for real use.

Templates stay available afterwards: every admin page has an **Add from templates** button, and incidents have **playbooks** with tasks, draft messages and example decisions.

To start over with an empty database: `docker compose down -v` (this deletes all data).

## Configuration (`.env`)

Copy `.env.example` to `.env` next to `docker-compose.yml`. Everything is optional; `.env` is git-ignored.

### AI-assisted setup

Configure one or more providers. On the setup page you pick which one to use.

| Provider           | Variables                                         | Model                                                   |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| Anthropic (Claude) | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`   | default `claude-opus-5-5`                               |
| OpenAI             | `OPENAI_API_KEY`, optional `OPENAI_MODEL`         | default `gpt-4.1`                                       |
| OpenRouter         | `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL` | **chosen on the setup page** from the live model list   |
| Ollama (local)     | `OLLAMA_BASE_URL`, optional `OLLAMA_MODEL`        | **chosen on the setup page** from your installed models |

Example:

```env
OPENROUTER_API_KEY=sk-or-...
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Notes:

- Your text is sent to the chosen provider. With **Ollama** it stays on your own machine.
- Ollama runs outside the container: `host.docker.internal` points to your machine. On Linux, start Ollama with `OLLAMA_HOST=0.0.0.0` so the container can reach it.
- Files: **PDF and images** are sent to the AI as they are (the model reads layout, tables and scans). **Word (.docx), Excel (.xlsx) and PowerPoint (.pptx)** are read by IRTrack itself, keeping tables and sheets as rows and columns. Text files are read as text. Old `.doc`/`.xls`/`.ppt` files: save them as `.docx`/`.xlsx`/`.pptx` first. Limits: 20 files, 25 MB per file, 30 MB in total; text beyond 150,000 characters is cut off.
- Ollama cannot read PDF files (other formats work; images only with a vision model). With OpenRouter, models without native PDF support use OpenRouter's own PDF processing, which may cost extra.
- The AI only uses facts from your documents and fills fields with clean, logical values. Where each item came from (file and a short quote) is shown when you hover over it in the review; that source is never saved. Contacts it adds are marked "please verify". Always check the proposal.

### AI assistant

With an AI provider configured, an **Ask AI** button appears at the bottom right:

- **User Portal:** employees ask what to do or who to contact ("I received a suspicious email, what should I do?"). The assistant only uses guidance, the escalation ladder and processes. It cannot see or change incidents.
- **Admin Console:** the same assistant, with all MCP tools: incidents, deadlines, dashboard, contacts, templates and settings. It can change data, but every change is shown as a card with **Approve / Decline** and only happens after you approve.

The assistant works through IRTrack's own MCP server (loopback), so every change appears in the audit log as `MCP: AI assistant (…)`.

| Variable           | Meaning                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `AI_CHAT_PROVIDER` | `anthropic`, `openai`, `openrouter` or `ollama`. Empty = the first configured provider that has a model.                         |
| `AI_CHAT_MODEL`    | Model for the assistant. Empty = the provider's default (`ANTHROPIC_MODEL`, `OPENAI_MODEL`, `OPENROUTER_MODEL`, `OLLAMA_MODEL`). |

The model must support tool calling. For OpenRouter and Ollama, set `OPENROUTER_MODEL` / `OLLAMA_MODEL` (or `AI_CHAT_MODEL`), because the assistant has no model picker. Conversations are kept in memory for an hour and are lost when the container restarts.

### MCP server

`/mcp` is always available (Streamable HTTP). Set `IRTRACK_MCP_TOKEN` to require a Bearer token; without it there is no token check. See [docs/mcp.md](docs/mcp.md), including how to connect n8n.

> IRTrack has no login yet. Without a token, anyone who can reach the server can use the web app, the API and MCP. Run it in a trusted network until authentication is added.

### Server

| Variable         | Default (Docker)   | Meaning                                         |
| ---------------- | ------------------ | ----------------------------------------------- |
| `IRTRACK_DB`     | `/data/irtrack.db` | SQLite database file                            |
| `IRTRACK_STATIC` | `/app/public`      | Built web app                                   |
| `PORT`           | `3000`             | HTTP port inside the container (mapped to 8080) |

## Backup

All data is in `/data/irtrack.db` in the `irtrack-data` volume. See [docs/deployment.md](docs/deployment.md) for an online backup command.

## Development

```bash
bun install
bun run server   # API + SQLite on http://localhost:3000 (./data/irtrack.db)
bun run dev      # web app on http://localhost:8080, proxies /api to :3000
bun run test     # unit tests (Vitest; needs Node.js)
```

For AI setup during development, export the same variables (for example `OPENROUTER_API_KEY`) before `bun run server`.

## Documentation

- [docs/architecture.md](docs/architecture.md) — layers and decisions
- [docs/database.md](docs/database.md) — SQLite schema, templates and first start
- [docs/api-contract.md](docs/api-contract.md) — REST endpoints
- [docs/mcp.md](docs/mcp.md) — MCP server and tools
- [docs/configuration.md](docs/configuration.md) — settings and environment variables
- [docs/deployment.md](docs/deployment.md) — Docker, backup, local development
- [docs/domain-model.md](docs/domain-model.md), [docs/authorization.md](docs/authorization.md)

## License

Copyright 2026 patatties

Licensed under the [Apache License, Version 2.0](LICENSE). You may use, modify and distribute IRTrack, also commercially, as long as you keep the license and copyright notices.
