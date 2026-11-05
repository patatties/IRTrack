# Architecture

IRTrack is a browser application plus a small self-hosted server. Both ship in one Docker image: a Bun process serves the built web app and the REST API (`/api`), and keeps all data in one SQLite file.

```text
routes (TanStack Router)  ->  features/portal, features/admin  ->  shared (UI, hooks)
                                       |
                                    data/index.ts (adapter selection)
                                       |
                                    data/api (REST client)  --HTTP /api-->  server/ (Bun)
                                       |                                      |
                                  domain (types, Zod, rules)  <-- shared --  SQLite (bun:sqlite)
```

- `src/domain` — entities, Zod schemas and pure business rules (CRT test, deadline computation, flowchart validation, masking, suggestions). Fully unit tested. Used by both the browser and the server.
- `src/data/ports.ts` — repository interfaces. All access is async; lists support pagination, sorting and filtering.
- `src/data/api` — REST client matching `docs/api-contract.md`. Sends the acting user's name in `X-IRTrack-Actor`.
- `server/` — the backend:
  - `schema.ts` — the SQLite schema, one table spec per domain type (see `docs/database.md`). The same spec drives the DDL and the row ↔ object mapping.
  - `db.ts` — opening, migrations (`PRAGMA user_version`), generic load/save, settings, secrets and the central `audit()` function.
  - `api.ts` — the endpoints. Every mutation calls `audit()`.
  - `templates.ts` — the template catalog (contacts, roles, processes, reporting rules, guidance, sources, incident playbooks) and default settings.
  - `catalog.ts` — lists templates and applies a selection, including dependencies and links.
  - `mcp.ts` — MCP server at `/mcp` (see `docs/mcp.md`); its tools call the API handlers in-process.
  - `ai.ts` — AI-assisted setup: provider calls (Anthropic, OpenAI, OpenRouter, Ollama via `fetch`), background analysis jobs, proposal sanitizing and applying.
  - `extract.ts` — prepares uploaded files: PDFs and images are passed to the model natively; Word, Excel and PowerPoint are unzipped and their text extracted (no dependencies).
  - `internal.ts` — calls the REST handlers in-process; used by MCP and the AI setup so they share validation and the audit trail.
  - `mcpClient.ts` — minimal MCP client; the AI setup uses it to save through `/mcp` over loopback.
  - `assistant.ts` — AI assistant for portal (read-only guidance/contacts tools) and Admin Console (all tools; changes wait for approval). Tool calling per provider with `fetch`; tools come from the own MCP server over loopback.
  - `index.ts` — HTTP server: `/api/*`, `/mcp` and the static app with SPA fallback.
- `src/auth` — `AuthProvider`, `can()`, `PermissionGate`, `AdminGuard`, the acting user.
- `src/i18n` — interface text dictionaries; `t("key")`.

## Decisions

- **Router**: the hosting template fixes TanStack Router/Start instead of React Router. Pages render client-side only (a hydration gate in `__root.tsx`); the Docker build uses SPA mode, so the server only serves static files plus `/api`.
- **SQLite**: no extra database container. The file lives on the `/data` volume; WAL mode, foreign keys on.
- **Audit trail**: `audit_events` is append-only, enforced by triggers.
- **Secrets**: written through the API into the `secrets` table and never returned; the settings endpoint only reports "configured" flags.
- **Snapshots**: incidents store the process version and a reporting-deadline snapshot; rule changes affect new incidents only until "Reapply" is used (logged).
- **No login yet**: the actor name comes from the browser and is not verified. Add authentication before exposing IRTrack outside a trusted network.
- Components never call the API directly; they use hooks in `src/shared/hooks.ts` that call `repos()`.
