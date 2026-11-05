# MCP server

IRTrack hosts its own [Model Context Protocol](https://modelcontextprotocol.io) server, so AI assistants (Claude Code, Claude Desktop and other MCP clients) can look up and update incidents. It runs in the same container as the app and the REST API, at `/mcp`.

- Transport: Streamable HTTP, stateless; requests are JSON-RPC over `POST /mcp` and answered with JSON.
- Tools use the same logic as the REST API (`server/api.ts`): the same validation, and every change goes into the audit trail with actor `MCP: <client>`.
- Implemented in `server/mcp.ts` without extra dependencies.

## Access

MCP is always on. Authentication for IRTrack comes later; until then there is an **optional** token:

- **No token (default):** anyone who can reach `/mcp` can use it, like the web app and the REST API.
- **With a token:** set `IRTRACK_MCP_TOKEN` and every MCP request must send `Authorization: Bearer <token>`.

To set a token, put it in a `.env` file next to `docker-compose.yml` (git-ignored) and restart with `docker compose up -d --build`:

```env
IRTRACK_MCP_TOKEN=paste-a-long-random-string-here   # e.g. from: openssl rand -hex 32
```

The log shows `MCP at /mcp (no token)` or `(token required)`. Requests from a browser on another website are always refused.

MCP tools can change data. Without a token, only run IRTrack where you trust everyone who can reach it, and use HTTPS (a reverse proxy) beyond your own machine.

## Connect a client

n8n: add an **MCP Client Tool** node to an AI Agent, choose transport **HTTP Streamable** and set the endpoint:

- n8n in the same Docker network as IRTrack: `http://irtrack:3000/mcp`
- n8n in another container on the same machine: `http://host.docker.internal:8080/mcp`
- Authentication: none, or _Bearer_ with the token when `IRTRACK_MCP_TOKEN` is set.

IRTrack answers with plain JSON (no SSE stream), as Streamable HTTP allows. Older n8n versions that only offer the SSE transport cannot connect.

Claude Code, without a token:

```bash
claude mcp add --transport http irtrack http://localhost:8080/mcp
```

With a token, add `--header "Authorization: Bearer <token>"`. Other clients: URL `http://localhost:8080/mcp`, plus the same header when a token is set. Optionally send `X-IRTrack-Actor: <name>` to show a name in the audit trail.

## Tools

| Tool                    | Changes data | What it does                                                                      |
| ----------------------- | ------------ | --------------------------------------------------------------------------------- |
| `list_incidents`        | no           | Search and filter incidents (text, open/closed, domain, minimum severity, period) |
| `get_incident`          | no           | Full incident by id or reference (`IRT-…`): tasks, timeline, decisions, deadlines |
| `list_open_deadlines`   | no           | Pending reporting deadlines of open incidents, soonest first                      |
| `get_dashboard`         | no           | Open/serious incidents, deadlines today, KPIs vs previous period                  |
| `get_escalation_ladder` | no           | Contacts per escalation step, plus emergency and other contacts                   |
| `search_guidance`       | no           | Published guidance for a situation (first steps, don'ts, next steps)              |
| `list_processes`        | no           | Configured processes                                                              |
| `create_incident`       | yes          | Report a new incident; deadlines are computed from the process                    |
| `update_incident_phase` | yes          | Move an incident to another phase                                                 |
| `add_incident_note`     | yes          | Add a timeline note                                                               |
| `record_decision`       | yes          | Add a decision with rationale to the decision log                                 |
| `get_setup_status`      | no           | Whether the first setup is done, and counts per kind                              |
| `list_templates`        | no           | Templates of a kind, with "already added" and dependencies                        |
| `apply_templates`       | yes          | Add templates by id; dependencies come along automatically                        |
| `update_settings`       | yes          | Organization, portal or master data (master data lists are merged)                |
| `add_contact`           | yes          | Add a contact, optionally on the escalation ladder                                |
| `add_role`              | yes          | Add a role with responsibilities                                                  |
| `complete_setup`        | yes          | Mark the first setup as done                                                      |

## Used by IRTrack itself

The AI setup saves the reviewed proposal through this MCP server over loopback (`http://127.0.0.1:3000/mcp`, `server/mcpClient.ts`): a full `initialize` handshake, then one `tools/call` per item. Every AI setup therefore also tests MCP end to end, nothing goes over the internet, and every change appears in the audit log as `MCP: AI setup (…)`. When `IRTRACK_MCP_TOKEN` is set, the loopback client sends it too.

## Test with curl

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

When a token is set, add `-H "Authorization: Bearer <token>"`.
