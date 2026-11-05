# Configuration

## Server (environment variables)

| Env var                                  | Default (Docker)   | Meaning                                                                                                                                  |
| ---------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `IRTRACK_DB`                             | `/data/irtrack.db` | SQLite database file. Created empty on first start.                                                                                      |
| `IRTRACK_STATIC`                         | `/app/public`      | Folder with the built web app                                                                                                            |
| `PORT`                                   | `3000`             | HTTP port                                                                                                                                |
| `IRTRACK_MCP_TOKEN`                      | empty              | Optional token for the MCP server at `/mcp`; when set, clients must send it as Bearer token (see `docs/mcp.md`). Empty = no token check. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`   | empty              | AI setup with Anthropic (default model `claude-opus-5-5`)                                                                                |
| `OPENAI_API_KEY`, `OPENAI_MODEL`         | empty              | AI setup with OpenAI (default model `gpt-4.1`)                                                                                           |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | empty              | AI setup with OpenRouter; model chosen on the setup page                                                                                 |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL`        | empty              | AI setup with a local Ollama, e.g. `http://host.docker.internal:11434`; model chosen on the setup page                                   |

Outside Docker the defaults are `./data/irtrack.db` and `./dist`.

## Settings (Admin → Settings)

Stored in the `settings` table (one JSON value per section), with a change log in `settings_history`.

| Section              | Settings                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| Organization         | name, brand color, language, time zone, date format, business hours, holidays        |
| Database and storage | attachment storage (local/S3), S3 bucket; shows SQLite file, size and schema version |
| Reporting deadlines  | rules with legal basis, regulator, anchor, stages, reminders, owner, effective date  |
| Severity and SLAs    | impact × urgency, SLA hours                                                          |
| Response teams       | IRT/CRT names, departments, activators, CSIRT/CERT aliases                           |
| User Portal          | title, welcome, emergency message/number, featured, verification and review periods  |
| Users and access     | current user; planned auth methods (disabled)                                        |
| Notifications        | SMTP host + password (secret), Teams, Slack, reminders                               |
| Integrations         | TOPdesk/ServiceNow API keys, webhook secret (secrets)                                |
| Data and privacy     | HR default classification, retention, anonymization                                  |
| Master data          | locations, services, business units, departments, suppliers                          |
| System               | version, runtime, health, audit log, config import/export                            |

Secrets are stored in the `secrets` table, never returned by the API, never exported and never shown after saving; only "Configured / Not configured" is displayed.
