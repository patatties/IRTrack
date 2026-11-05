## IRTrack architecture rules

- Layers: `src/domain` (types, rules) → `src/data/ports.ts` (interfaces) → `src/data/api` (REST client) → `server/` (Bun + SQLite); adapter chosen only in `src/data/index.ts`. Why: screens stay independent of the backend.
- Components never call the API directly; they use hooks in `src/shared/hooks.ts`. Why: keeps the backend swappable.
- The SQLite schema is defined only in `server/schema.ts`, one table spec per domain type; schema changes need a migration step in `server/db.ts`. Why: existing databases on the `/data` volume must upgrade on start.
- Contacts fill roles: `Contact.roleIds` is the only link. `Role.contactIds` is derived by the API, and the escalation level always comes from the role. The UI shows roles first, with their contacts. Why: one source of truth, no conflicting levels.
- Every mutation in `server/api.ts` calls `audit()` in `server/db.ts`. Why: single immutable audit trail (`audit_events` is append-only).
- MCP tools in `server/mcp.ts` call the REST handlers in-process (`handleApi`), never the database directly; MCP is always on, `IRTRACK_MCP_TOKEN` is an optional token until authentication is added. Why: one set of rules and one audit trail for UI, API and AI clients.
- The AI setup (`server/ai.ts`) only proposes; it saves nothing until the user applies a reviewed proposal, and then only through IRTrack's own MCP server over loopback (`server/mcpClient.ts`), whose tools call the REST handlers. LLM providers are called with plain `fetch`, keys come only from environment variables and are never returned by the API. Why: human review, one audit trail, no extra dependencies.
- The AI assistant (`server/assistant.ts`) uses only MCP tools over loopback. Portal mode gets a fixed read-only allowlist (no incidents); in admin mode every tool without `readOnlyHint` waits for explicit user approval. Why: confidential incidents stay out of the portal, and AI never changes data on its own.
- No mock data in the app. A new database starts empty and is filled in the `/setup` wizard from the template catalog in `server/templates.ts` (applied by `server/catalog.ts`). The fictional demo data set lives only in `server/demo.ts` and is loaded only when the user picks "Load demo data" on an empty database. Why: production data only, unless the user explicitly asks for a demo.
- Permission checks go only through `can()` / `PermissionGate` in `src/auth`. Why: enforcement can be enabled in one place.
- Confidential masking goes only through `maskIncident()` in `src/domain/rules.ts`. Why: one rule for wallboard/executive/portal.
- The web app is a static single-page app (Vite + TanStack Router, file-based routes in `src/routes`, entry `src/main.tsx`), built into `dist/` and served by `server/index.ts` next to `/api`. Why: one Docker image, one process.
- Interface text lives in `src/i18n`. Why: more languages later.
- No hosted backend services or serverless functions. Why: must run self-hosted.
