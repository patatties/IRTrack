/**
 * IRTrack MCP server (Model Context Protocol) at /mcp, "Streamable HTTP" transport.
 *
 * Stateless JSON-RPC over HTTP POST; responses are plain JSON (no SSE stream, GET returns 405).
 * Tools call the same handlers as the REST API (server/api.ts), so every change is validated
 * the same way and written to the audit trail with actor "MCP: <client>".
 *
 * Security: always on. If IRTRACK_MCP_TOKEN is set, every request must send
 * "Authorization: Bearer <token>"; without it there is no check (real authentication comes later).
 * Browser requests from other origins are always refused.
 */
import { VERSION } from "./api";
import { callApi } from "./internal";
import {
  LEVELS,
  PHASES,
  DOMAINS,
  TEMPLATE_KINDS,
  type Contact,
  type ContactInput,
  type GuidanceSituation,
  type Incident,
  type LevelId,
  type Role,
  type Settings,
} from "../src/domain/types";
import { publishedVersion } from "../src/domain/rules";
import type { DashboardData, Page } from "../src/data/ports";

const TOKEN = process.env.IRTRACK_MCP_TOKEN ?? "";
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type Json = Record<string, unknown>;
interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Json;
}

/* ---------- calling the REST handlers in-process ---------- */
const api = callApi;
class ToolError extends Error {}

/** Accepts an incident id or reference number (IRT-…). */
async function findIncident(actor: string, idOrRef: string): Promise<Incident> {
  const direct = await api<Incident | null>(
    actor,
    "GET",
    `/incidents/${encodeURIComponent(idOrRef)}`,
  );
  if (direct) return direct;
  const page = await api<Page<Incident>>(actor, "GET", "/incidents", undefined, {
    search: idOrRef,
    pageSize: 50,
  });
  const hit = page.items.find((i) => i.ref.toLowerCase() === idOrRef.trim().toLowerCase());
  if (!hit) throw new ToolError(`No incident with id or reference “${idOrRef}”.`);
  return api<Incident>(actor, "GET", `/incidents/${hit.id}`);
}

const summary = (i: Incident) => ({
  id: i.id,
  ref: i.ref,
  title: i.title,
  domain: i.domain,
  processId: i.processId,
  severity: i.severity,
  level: i.level,
  phase: i.phase,
  classification: i.classification,
  owner: i.ownerId,
  location: i.location,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
  nextDeadline: i.deadlines
    .filter((d) => d.status !== "submitted")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0],
});

/* ---------- tools ---------- */
interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  readOnly: boolean;
  run: (args: Json, actor: string) => Promise<unknown>;
}

const str = (description: string, extra: Json = {}) => ({ type: "string", description, ...extra });
const int = (description: string, extra: Json = {}) => ({ type: "integer", description, ...extra });
const obj = (properties: Json, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const TOOLS: Tool[] = [
  {
    name: "list_incidents",
    title: "List incidents",
    description: "Search and filter incidents, newest first. Returns a short summary per incident.",
    readOnly: true,
    inputSchema: obj({
      search: str("Text to search in reference, title, source id, category and location"),
      open: { type: "boolean", description: "true = only open incidents, false = only closed" },
      domain: str("Domain", { enum: [...DOMAINS] }),
      minSeverity: int("Minimum severity 1 (low) to 4 (critical)", { minimum: 1, maximum: 4 }),
      days: int("Only incidents created in the last N days", { minimum: 1 }),
      limit: int("Maximum number of results (default 20, max 100)", { minimum: 1, maximum: 100 }),
    }),
    run: async (a, actor) => {
      const page = await api<Page<Incident>>(actor, "GET", "/incidents", undefined, {
        search: a.search,
        open: a.open,
        domain: a.domain,
        minSeverity: a.minSeverity,
        days: a.days,
        pageSize: Math.min(100, Number(a.limit ?? 20)),
      });
      return { total: page.total, items: page.items.map(summary) };
    },
  },
  {
    name: "get_incident",
    title: "Get incident",
    description:
      "Full details of one incident: tasks, timeline, decisions, communication, deadlines and activations.",
    readOnly: true,
    inputSchema: obj({ incident: str("Incident id or reference number, e.g. IRT-2690001") }, [
      "incident",
    ]),
    run: (a, actor) => findIncident(actor, String(a.incident)),
  },
  {
    name: "create_incident",
    title: "Report an incident",
    description:
      "Register a new incident. If no process is given, IRTrack uses the first configured process. Reporting deadlines of the process are computed automatically.",
    readOnly: false,
    inputSchema: obj(
      {
        title: str("Short title"),
        description: str("What happened"),
        processId: str("Process id (see list_processes)"),
        severity: int("Severity 1 (low) to 4 (critical)", { minimum: 1, maximum: 4 }),
        level: str("Response level", { enum: [...LEVELS] }),
        personalData: {
          type: "boolean",
          description: "Personal data may be involved (adds the GDPR deadline when configured)",
        },
        location: str("Location"),
      },
      ["title", "description", "severity"],
    ),
    run: async (a, actor) => {
      const now = new Date().toISOString();
      const severity = Number(a.severity);
      const level =
        (a.level as LevelId | undefined) ??
        (severity === 4 ? "coordinated" : severity === 3 ? "elevated" : "standard");
      const inc = await api<Incident>(actor, "POST", "/incidents", {
        title: a.title,
        description: a.description,
        processId: a.processId ?? "",
        severity,
        level,
        startedAt: now,
        detectedAt: now,
        awareAt: now,
        personalData: Boolean(a.personalData),
        location: a.location ?? "",
        suggestion: {
          processId: String(a.processId ?? ""),
          severity,
          level,
          reasons: ["Reported through MCP."],
          overridden: false,
        },
      });
      return summary(inc);
    },
  },
  {
    name: "update_incident_phase",
    title: "Change incident phase",
    description: "Move an incident to another phase (report → assess → respond → recover → close).",
    readOnly: false,
    inputSchema: obj(
      {
        incident: str("Incident id or reference"),
        phase: str("New phase", { enum: [...PHASES] }),
        reason: str("Why (recorded in the audit trail)"),
      },
      ["incident", "phase"],
    ),
    run: async (a, actor) => {
      const i = await findIncident(actor, String(a.incident));
      const next = await api<Incident>(actor, "PATCH", `/incidents/${i.id}`, {
        patch: { phase: a.phase },
        summary: `Phase → ${a.phase}${a.reason ? ` (${a.reason})` : ""}`,
      });
      return summary(next);
    },
  },
  {
    name: "add_incident_note",
    title: "Add a timeline note",
    description: "Add a note to the timeline of an incident.",
    readOnly: false,
    inputSchema: obj({ incident: str("Incident id or reference"), text: str("The note") }, [
      "incident",
      "text",
    ]),
    run: async (a, actor) => {
      const i = await findIncident(actor, String(a.incident));
      const entry = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actor,
        kind: "note",
        text: String(a.text),
      };
      await api<Incident>(actor, "PATCH", `/incidents/${i.id}`, {
        patch: { timeline: [...i.timeline, entry] },
        summary: "Note added",
      });
      return { ok: true, ref: i.ref };
    },
  },
  {
    name: "record_decision",
    title: "Record a decision",
    description: "Record a decision with its rationale in the decision log of an incident.",
    readOnly: false,
    inputSchema: obj(
      { incident: str("Incident id or reference"), what: str("What was decided"), why: str("Why") },
      ["incident", "what", "why"],
    ),
    run: async (a, actor) => {
      const i = await findIncident(actor, String(a.incident));
      const at = new Date().toISOString();
      await api<Incident>(actor, "PATCH", `/incidents/${i.id}`, {
        patch: {
          decisions: [
            ...i.decisions,
            { id: crypto.randomUUID(), what: String(a.what), why: String(a.why), by: actor, at },
          ],
          timeline: [
            ...i.timeline,
            { id: crypto.randomUUID(), at, actor, kind: "decision", text: `Decision: ${a.what}` },
          ],
        },
        summary: `Decision: ${a.what}`,
      });
      return { ok: true, ref: i.ref };
    },
  },
  {
    name: "list_open_deadlines",
    title: "Open reporting deadlines",
    description:
      "Reporting deadlines (GDPR, NIS2 …) of open incidents that are not submitted yet, soonest first.",
    readOnly: true,
    inputSchema: obj({}),
    run: async (_a, actor) => {
      const page = await api<Page<Incident>>(actor, "GET", "/incidents", undefined, {
        open: true,
        pageSize: 1000,
      });
      return page.items
        .flatMap((i) =>
          i.deadlines
            .filter((d) => d.status !== "submitted")
            .map((d) => ({
              ref: i.ref,
              incident: i.title,
              rule: d.ruleName,
              stage: d.stage,
              dueAt: d.dueAt,
              overdue: new Date(d.dueAt) < new Date(),
            })),
        )
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    },
  },
  {
    name: "get_dashboard",
    title: "Dashboard summary",
    description:
      "Key figures: open and serious incidents, deadlines due today and KPIs compared with the previous period.",
    readOnly: true,
    inputSchema: obj({ days: int("Period in days (default 30)", { minimum: 1 }) }),
    run: async (a, actor) => {
      const d = await api<DashboardData>(actor, "GET", "/analytics/dashboard", undefined, {
        days: a.days ?? 30,
        ctx: "admin",
      });
      return {
        summary: d.summary,
        kpis: d.kpis.map(({ link: _l, ...k }) => k),
        funnel: d.funnel.map(({ link: _l, ...f }) => f),
        serious: d.serious.map(summary),
      };
    },
  },
  {
    name: "get_escalation_ladder",
    title: "Escalation ladder",
    description:
      "Roles per escalation level, from least serious (level 1) to most impact (level 4), each with the contacts who fill it; plus emergency and other contacts without a role.",
    readOnly: true,
    inputSchema: obj({}),
    run: async (_a, actor) => {
      const [cs, roles] = await Promise.all([
        api<Contact[]>(actor, "GET", "/contacts"),
        api<Role[]>(actor, "GET", "/roles"),
      ]);
      const brief = (c: Contact) => ({
        id: c.id,
        name: c.name,
        function: c.role,
        team: c.team,
        phone: c.phone,
        email: c.email,
        availability: c.availability,
        whenToContact: c.whenToContact,
      });
      const withContacts = (r: Role) => ({
        id: r.id,
        role: r.name,
        summary: r.summary,
        contacts: cs.filter((c) => c.roleIds?.includes(r.id)).map(brief),
      });
      const noRole = cs.filter((c) => !c.roleIds?.length);
      return {
        levels: LEVELS.map((l, k) => ({
          level: k + 1,
          id: l,
          roles: roles.filter((r) => r.level === l).map(withContacts),
        })),
        rolesWithoutLevel: roles.filter((r) => !r.level).map(withContacts),
        emergency: noRole.filter((c) => c.emergency).map(brief),
        other: noRole.filter((c) => !c.emergency).map(brief),
      };
    },
  },
  {
    name: "list_roles",
    title: "List roles",
    description:
      "All roles with their escalation level and the ids of the contacts who fill them. Use the role ids with add_contact.",
    readOnly: true,
    inputSchema: obj({}),
    run: async (_a, actor) =>
      (await api<Role[]>(actor, "GET", "/roles")).map((r) => ({
        id: r.id,
        name: r.name,
        level: r.level ?? "",
        summary: r.summary,
        contactIds: r.contactIds,
      })),
  },
  {
    name: "search_guidance",
    title: "Search guidance",
    description:
      "Find published guidance for a situation (what to do first, what not to do, who to contact).",
    readOnly: true,
    inputSchema: obj(
      { query: str("Words describing the situation, e.g. 'phishing email' or 'water leak'") },
      ["query"],
    ),
    run: async (a, actor) => {
      const words = String(a.query).toLowerCase().split(/\s+/).filter(Boolean);
      const all = await api<GuidanceSituation[]>(actor, "GET", "/guidance");
      return all
        .map((s) => ({ s, v: publishedVersion(s) }))
        .filter((x) => x.v)
        .map(({ s, v }) => {
          const c = v!.content;
          const hay =
            `${c.title} ${c.description} ${c.keywords.join(" ")} ${c.category}`.toLowerCase();
          return {
            score: words.filter((w) => hay.includes(w)).length,
            item: {
              slug: s.slug,
              title: c.title,
              description: c.description,
              doFirst: c.doFirst,
              dont: c.dont,
              next: c.next,
              processId: c.processId,
            },
          };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((x) => x.item);
    },
  },
  {
    name: "list_processes",
    title: "List processes",
    description: "Configured incident processes with their domain and version.",
    readOnly: true,
    inputSchema: obj({}),
    run: async (_a, actor) =>
      (
        await api<{ id: string; name: string; domain: string; purpose: string; version: number }[]>(
          actor,
          "GET",
          "/processes",
        )
      ).map(({ id, name, domain, purpose, version }) => ({ id, name, domain, purpose, version })),
  },

  /* ---------- configuration (used by the AI setup over loopback, and by any MCP client) ---------- */
  {
    name: "get_setup_status",
    title: "Setup status",
    description:
      "Whether the first setup is completed, and how many contacts, roles, rules, processes, guidance situations and sources exist.",
    readOnly: true,
    inputSchema: obj({}),
    run: (_a, actor) => api(actor, "GET", "/setup"),
  },
  {
    name: "list_templates",
    title: "List templates",
    description:
      "Ready-made examples that can be added with apply_templates. Shows which are already added and what each one brings along.",
    readOnly: true,
    inputSchema: obj({ kind: str("Kind of template", { enum: [...TEMPLATE_KINDS] }) }, ["kind"]),
    run: (a, actor) => api(actor, "GET", `/templates/${String(a.kind)}`),
  },
  {
    name: "apply_templates",
    title: "Add from templates",
    description:
      "Add templates by id (see list_templates). Dependencies are added automatically: a process brings its roles and reporting rules, a guidance situation its process and roles. Existing items are skipped.",
    readOnly: false,
    inputSchema: obj(
      {
        kind: str("Kind of template", { enum: [...TEMPLATE_KINDS] }),
        ids: { type: "array", items: { type: "string" }, description: "Template ids" },
      },
      ["kind", "ids"],
    ),
    run: (a, actor) =>
      api(actor, "POST", `/templates/${String(a.kind)}/apply`, {
        ids: Array.isArray(a.ids) ? a.ids.map(String) : [],
      }),
  },
  {
    name: "update_settings",
    title: "Update settings",
    description:
      "Update organization details, portal texts or master data. Only the given fields change; master data lists are merged with the existing values.",
    readOnly: false,
    inputSchema: obj(
      {
        section: str("Settings section", { enum: ["organization", "portal", "masterData"] }),
        values: {
          type: "object",
          description:
            "organization: name, timezone, language, businessHours … · portal: title, welcome, emergencyNumber, emergencyMessage … · masterData: locations, services, businessUnits, departments, suppliers (string arrays)",
        },
      },
      ["section", "values"],
    ),
    run: async (a, actor) => {
      const section = String(a.section) as "organization" | "portal" | "masterData";
      if (!["organization", "portal", "masterData"].includes(section))
        throw new ToolError(`Unknown section ${section}`);
      const current = await api<Settings>(actor, "GET", "/settings");
      const values = (a.values ?? {}) as Record<string, unknown>;
      const before = current[section] as Record<string, unknown>;
      const next: Record<string, unknown> = { ...before };
      for (const [k, v] of Object.entries(values)) {
        if (!(k in before) || v === undefined || v === null || v === "") continue; // unknown or empty fields are ignored
        next[k] =
          section === "masterData"
            ? [...new Set([...(before[k] as string[]), ...(Array.isArray(v) ? v.map(String) : [])])]
            : typeof before[k] === "number"
              ? Number(v)
              : v;
      }
      const changed = Object.keys(next).filter(
        (k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]),
      );
      if (changed.length) await api(actor, "PUT", `/settings/${section}`, next);
      return { section, changed };
    },
  },
  {
    name: "add_contact",
    title: "Add a contact",
    description:
      "Add a contact and the roles they fill (see list_roles). The roles decide where the contact appears on the escalation ladder.",
    readOnly: false,
    inputSchema: obj(
      {
        name: str("Name of the person, team, mailbox or organization"),
        type: str("Type", { enum: ["person", "team", "mailbox", "supplier", "external"] }),
        role: str("Role or function"),
        team: str("Team or department"),
        organization: str("Organization"),
        phone: str("Phone"),
        email: str("Email"),
        availability: str("When available, e.g. 24/7 or Mon–Fri 09:00–17:00"),
        whenToContact: str("When to contact"),
        outOfHours: str("Out-of-hours instructions"),
        roleIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Ids of the roles this contact fills (see list_roles). The escalation level comes from the roles. None = not on the ladder (suppliers, authorities, emergency services).",
        },
        emergency: { type: "boolean", description: "Emergency contact" },
        notes: str("Internal notes"),
      },
      ["name"],
    ),
    run: async (a, actor) => {
      const settings = await api<Settings>(actor, "GET", "/settings");
      const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
      const type = s("type") || "person";
      const input: ContactInput = {
        name: s("name"),
        type: (["person", "team", "mailbox", "supplier", "external"].includes(type)
          ? type
          : "person") as ContactInput["type"],
        role: s("role") || "Contact",
        team: s("team") || "—",
        organization: s("organization"),
        phone: s("phone"),
        mobile: "",
        email: s("email"),
        availability: s("availability"),
        timezone: settings.organization.timezone,
        outOfHours: s("outOfHours"),
        whenToContact: s("whenToContact"),
        backupId: "",
        notes: s("notes"),
        emergency: a.emergency === true,
        roleIds: Array.isArray(a.roleIds) ? a.roleIds.map(String) : [],
      };
      if (input.name.length < 2)
        throw new ToolError("A contact needs a name of at least 2 characters.");
      const c = await api<Contact>(actor, "POST", "/contacts", input);
      return { id: c.id, name: c.name, roleIds: c.roleIds ?? [] };
    },
  },
  {
    name: "add_role",
    title: "Add a role",
    description: "Add a role with its responsibilities.",
    readOnly: false,
    inputSchema: obj(
      {
        name: str("Role name"),
        summary: str("Short description"),
        level: str("Escalation level the role works at; empty = not tied to a level", {
          enum: [...LEVELS, ""],
        }),
        responsibilities: {
          type: "array",
          items: { type: "string" },
          description: "Responsibilities",
        },
      },
      ["name"],
    ),
    run: async (a, actor) => {
      const at = new Date().toISOString();
      const role: Role = {
        id: `r-${crypto.randomUUID().slice(0, 8)}`,
        name: String(a.name ?? "").trim(),
        summary: String(a.summary ?? ""),
        level: (LEVELS as readonly string[]).includes(String(a.level)) ? (a.level as LevelId) : "",
        responsibilities: Array.isArray(a.responsibilities) ? a.responsibilities.map(String) : [],
        skills: [],
        decides: [],
        contactIds: [],
        onEscalation: "",
        createdAt: at,
        createdBy: actor,
        updatedAt: at,
        updatedBy: actor,
      };
      if (!role.name) throw new ToolError("A role needs a name.");
      await api(actor, "PUT", `/roles/${role.id}`, role);
      return { id: role.id, name: role.name };
    },
  },
  {
    name: "complete_setup",
    title: "Complete the first setup",
    description:
      "Mark the first setup as done, so IRTrack opens normally instead of the setup page.",
    readOnly: false,
    inputSchema: obj({}),
    run: async (_a, actor) => {
      await api(actor, "POST", "/setup/complete", { skipped: false });
      return { completed: true };
    },
  },
];

/* ---------- JSON-RPC ---------- */
const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

async function dispatch(msg: RpcRequest, actor: string): Promise<Json | null> {
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "irtrack", title: "IRTrack", version: VERSION },
        instructions:
          "IRTrack incident response management. Look up incidents, deadlines, guidance and the escalation ladder; report incidents and update them. Changes are recorded in the IRTrack audit trail.",
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: {
            title: t.title,
            readOnlyHint: t.readOnly,
            destructiveHint: false,
            openWorldHint: false,
          },
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${String(msg.params?.name)}`);
      try {
        const out = await tool.run((msg.params?.arguments as Json) ?? {}, actor);
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          isError: false,
        });
      } catch (e) {
        // Tool failures are reported in the result so the model can see and handle them.
        return rpcResult(msg.id, {
          content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        });
      }
    }
    default:
      if (isNotification) return null; // e.g. notifications/initialized
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function handleMcp(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  // DNS-rebinding protection: browsers send Origin; only same-host origins are accepted.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host)
    return json({ error: "Origin not allowed" }, 403);
  // Optional token until real authentication arrives: only checked when IRTRACK_MCP_TOKEN is set.
  if (TOKEN && req.headers.get("authorization") !== `Bearer ${TOKEN}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'Bearer realm="irtrack-mcp"',
      },
    });
  }
  if (req.method === "GET") return new Response(null, { status: 405, headers: { allow: "POST" } }); // no server-initiated stream
  if (req.method === "DELETE")
    return new Response(null, { status: 405, headers: { allow: "POST" } }); // stateless: no sessions
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }
  const clientName = req.headers.get("x-irtrack-actor")
    ? decodeURIComponent(req.headers.get("x-irtrack-actor")!)
    : "client";
  const actor = `MCP: ${clientName}`.slice(0, 200);
  const msgs = (Array.isArray(body) ? body : [body]) as RpcRequest[];
  const out: Json[] = [];
  for (const m of msgs) {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
      out.push(rpcError((m as RpcRequest)?.id, -32600, "Invalid request"));
      continue;
    }
    const r = await dispatch(m, actor);
    if (r) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202 }); // only notifications
  return json(Array.isArray(body) ? out : out[0]);
}
