import { differenceInHours, endOfDay, getDay, getHours, isAfter, startOfWeek } from "date-fns";
import {
  computeDeadlines,
  latestVersion,
  maskIncident,
  median,
  type ViewContext,
} from "../src/domain/rules";
import {
  DOMAINS,
  PHASES,
  type Activation,
  type Contact,
  type ContactInput,
  type GuidanceContent,
  type GuidanceSituation,
  type GuidanceStatus,
  type Incident,
  type LevelId,
  type Process,
  type ReportingRule,
  type ResponsibilityAssignment,
  type Role,
  type Settings,
  type Severity,
  type SourceSystem,
} from "../src/domain/types";
import type {
  DashboardData,
  DashboardFilters,
  IncidentQuery,
  NewIncidentInput,
  Page,
  SystemInfo,
} from "../src/data/ports";
import {
  DB_PATH,
  SCHEMA_VERSION,
  addSettingsHistory,
  audit,
  auditList,
  conn,
  getMeta,
  getSettingSections,
  loadAll,
  loadOne,
  nextSeq,
  save,
  secretFlags,
  setMeta,
  setSecret,
  setSettingSection,
  settingsHistory,
} from "./db";
import {
  contactSpec,
  guidanceSpec,
  incidentSpec,
  processSpec,
  raciSpec,
  roleSpec,
  ruleSpec,
  sourceSpec,
} from "./schema";
import { MASTER_DATA_EXAMPLES, PLAYBOOKS, defaultSettings } from "./templates";
import { applyTemplates, listTemplates, loadDemo } from "./catalog";
import { HttpError } from "./errors";
import { TEMPLATE_KINDS, type TemplateKind } from "../src/domain/types";

export const VERSION = "0.2.0";
const STARTED_AT = new Date().toISOString();

export { HttpError };
const notFound = (what: string): never => {
  throw new HttpError(404, `${what} not found`);
};

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  actor: string;
}

/* ---------- helpers ---------- */
const now = () => new Date().toISOString();
const num = (v: string | null) => (v === null || v === "" ? undefined : Number(v));
const bool = (v: string | null) => (v === null || v === "" ? undefined : v === "true");

function parseIncidentQuery(p: URLSearchParams): IncidentQuery {
  const s = (k: string) => p.get(k) || undefined;
  return {
    search: s("search"),
    domain: s("domain") as IncidentQuery["domain"],
    phase: s("phase") as IncidentQuery["phase"],
    severity: num(p.get("severity")) as Severity | undefined,
    minSeverity: num(p.get("minSeverity")) as Severity | undefined,
    level: s("level") as LevelId | undefined,
    source: s("source") as IncidentQuery["source"],
    processId: s("processId"),
    location: s("location"),
    service: s("service"),
    category: s("category"),
    businessUnit: s("businessUnit"),
    days: num(p.get("days")),
    open: bool(p.get("open")),
    weekday: num(p.get("weekday")),
    hour: num(p.get("hour")),
    sort: s("sort") as IncidentQuery["sort"],
    dir: s("dir") as IncidentQuery["dir"],
    page: num(p.get("page")),
    pageSize: num(p.get("pageSize")),
    ctx: (s("ctx") as ViewContext) ?? "admin",
  };
}

const allIncidents = () => loadAll<Incident>(incidentSpec, "", [], `"created_at" DESC`);
const findIncident = (id: string) => loadOne<Incident>(incidentSpec, id) ?? notFound("Incident");

function filterIncidents(all: Incident[], q: IncidentQuery): Incident[] {
  const t = Date.now();
  const s = q.search?.toLowerCase().trim();
  return all.filter((i) => {
    if (q.days && t - new Date(i.createdAt).getTime() > q.days * 864e5) return false;
    if (q.domain && i.domain !== q.domain) return false;
    if (q.phase && i.phase !== q.phase) return false;
    if (q.severity && i.severity !== q.severity) return false;
    if (q.minSeverity && i.severity < q.minSeverity) return false;
    if (q.level && i.level !== q.level) return false;
    if (q.source && i.source !== q.source) return false;
    if (q.processId && i.processId !== q.processId) return false;
    if (q.location && i.location !== q.location) return false;
    if (q.service && i.service !== q.service) return false;
    if (q.category && i.category !== q.category) return false;
    if (q.businessUnit && i.businessUnit !== q.businessUnit) return false;
    if (q.open !== undefined && (i.phase !== "close") !== q.open) return false;
    if (q.weekday !== undefined && getDay(new Date(i.createdAt)) !== q.weekday) return false;
    if (q.hour !== undefined && getHours(new Date(i.createdAt)) !== q.hour) return false;
    if (
      s &&
      !`${i.ref} ${i.title} ${i.sourceId} ${i.category} ${i.location}`.toLowerCase().includes(s)
    )
      return false;
    return true;
  });
}

const tl = (
  i: Incident,
  actor: string,
  kind: Incident["timeline"][number]["kind"],
  text: string,
  highlight = false,
) => i.timeline.push({ id: crypto.randomUUID(), at: now(), actor, kind, text, highlight });

function saveIncident(i: Incident, actor: string) {
  i.updatedAt = now();
  i.updatedBy = actor;
  return save(incidentSpec, i);
}

/** Lifecycle timestamps used by the dashboard KPIs, set once when a phase is first reached. */
function stampLifecycle(i: Incident) {
  const at = now();
  if (i.phase !== "report" && !i.firstResponseAt) i.firstResponseAt = at;
  if ((i.phase === "recover" || i.phase === "close") && !i.resolvedAt) i.resolvedAt = at;
  if (i.phase === "close" && !i.closedAt) i.closedAt = at;
}

/** Stored sections over the defaults: an empty database still returns complete settings. */
function settings(): Settings {
  const stored = getSettingSections() as Partial<Record<string, object>>;
  const defaults = defaultSettings() as unknown as Record<string, object>;
  const merged = Object.fromEntries(
    Object.entries(defaults).map(([k, v]) => [k, { ...v, ...(stored[k] ?? {}) }]),
  ) as unknown as Omit<Settings, "secrets" | "history">;
  return { ...merged, secrets: secretFlags(), history: settingsHistory() };
}
const SETTING_SECTIONS = [
  "organization",
  "database",
  "portal",
  "severity",
  "teams",
  "notifications",
  "privacy",
  "masterData",
] as const;

const rules = () => loadAll<ReportingRule>(ruleSpec, "", [], `"name"`);
const situations = () => loadAll<GuidanceSituation>(guidanceSpec, "", [], `"id"`);
const findSituation = (idOrSlug: string) =>
  loadAll<GuidanceSituation>(guidanceSpec, `"id" = ? OR "slug" = ?`, [idOrSlug, idOrSlug])[0];

/* ---------- incidents ---------- */
function incidentsList(c: Ctx): Page<Incident> {
  const q = parseIncidentQuery(c.query);
  const items = filterIncidents(allIncidents(), q);
  const dir = q.dir === "asc" ? 1 : -1;
  const sort = q.sort ?? "createdAt";
  items.sort(
    (a, b) =>
      (sort === "severity"
        ? a.severity - b.severity || a.createdAt.localeCompare(b.createdAt)
        : String(a[sort]).localeCompare(String(b[sort]))) * dir,
  );
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  const slice = items
    .slice((page - 1) * pageSize, page * pageSize)
    .map((i) => maskIncident(i, q.ctx ?? "admin"));
  return { items: slice, total: items.length, page, pageSize };
}

function incidentCreate(c: Ctx): Incident {
  const input = c.body as NewIncidentInput;
  // The portal suggests template process IDs; use the first configured process if that one is missing.
  const proc =
    loadOne<Process>(processSpec, input.processId) ??
    loadAll<Process>(processSpec, "", [], `"name"`)[0];
  if (!proc)
    throw new HttpError(
      409,
      "No processes are configured yet. Add a process in the Admin Console (Processes) first.",
    );
  const ref = `IRT-${new Date().getFullYear() % 100}${String(90000 + nextSeq("incident_seq"))}`;
  const at = now();
  const hrDefault = settings().privacy?.hrDefault ?? "confidential";
  const inc: Incident = {
    id: crypto.randomUUID(),
    ref,
    title: input.title,
    description: input.description,
    processId: input.processId,
    processVersion: proc.version,
    domain: proc.domain,
    source: "irtrack",
    sourceId: ref,
    severity: input.severity,
    level: input.level,
    phase: "report",
    classification: proc.domain === "hr" ? hrDefault : "normal",
    ownerId: "Service Desk",
    location: input.location || "Unknown",
    service: "—",
    businessUnit: "—",
    category: proc.name,
    startedAt: input.startedAt,
    detectedAt: input.detectedAt,
    awareAt: input.awareAt,
    personalData: input.personalData,
    suggestion: input.suggestion,
    nextStep: "The first line team will assess your report.",
    tasks: proc.tasks.map((t) => ({ id: crypto.randomUUID(), ...t, done: false })),
    decisions: [],
    timeline: [],
    comms: [],
    attachments: [],
    actions: [],
    deadlines: [],
    activations: [],
    relatedIds: [],
    createdAt: at,
    createdBy: c.actor,
    updatedAt: at,
    updatedBy: c.actor,
  };
  const ruleIds = new Set([...proc.reportingRuleIds, ...(input.personalData ? ["rr-gdpr"] : [])]);
  inc.deadlines = rules()
    .filter((r) => r.active && ruleIds.has(r.id))
    .flatMap((r) => computeDeadlines(r, inc));
  tl(inc, c.actor, "created", "Reported via the User Portal.");
  if (input.suggestion?.overridden)
    tl(
      inc,
      c.actor,
      "override",
      "Reporter changed the suggested process, severity or level.",
      true,
    );
  saveIncident(inc, c.actor);
  audit(c.actor, "incident.create", "incident", inc.id, `Created ${ref}`);
  return inc;
}

function incidentUpdate(c: Ctx): Incident {
  const { patch, summary, highlight } = c.body as {
    patch: Partial<Incident>;
    summary: string;
    highlight?: boolean;
  };
  const i = findIncident(c.params.id);
  // Identity and audit fields are owned by the server.
  const { id: _id, ref: _ref, createdAt: _ca, createdBy: _cb, ...safe } = patch;
  const next: Incident = { ...i, ...safe };
  if (safe.phase && safe.phase !== i.phase)
    tl(next, c.actor, "phase", `Phase changed to ${safe.phase}.`);
  if (safe.level && safe.level !== i.level)
    tl(next, c.actor, "level", `Response level changed to ${safe.level}.`, highlight);
  stampLifecycle(next);
  saveIncident(next, c.actor);
  audit(c.actor, "incident.update", "incident", i.id, `${i.ref}: ${summary}`, highlight);
  return next;
}

function incidentActivate(c: Ctx): Incident {
  const a = c.body as Omit<Activation, "id" | "at" | "by">;
  const i = findIncident(c.params.id);
  const act: Activation = { ...a, id: crypto.randomUUID(), at: now(), by: c.actor };
  i.activations.push(act);
  i.level = a.team === "crt" ? "critical" : i.level === "critical" ? "critical" : "coordinated";
  i.decisions.push({
    id: crypto.randomUUID(),
    what: `Activate ${a.team.toUpperCase()}`,
    why: a.rationale,
    by: c.actor,
    at: act.at,
    override: a.override,
  });
  tl(
    i,
    c.actor,
    a.override ? "override" : "activation",
    `${a.team.toUpperCase()} activated${a.override ? " by override" : ""}: ${a.rationale}`,
    true,
  );
  saveIncident(i, c.actor);
  audit(
    c.actor,
    `incident.activate_${a.team}`,
    "incident",
    i.id,
    `${i.ref}: ${a.team.toUpperCase()} activated${a.override ? " (OVERRIDE)" : ""}`,
    true,
  );
  return i;
}

function incidentReapply(c: Ctx): Incident {
  const i = findIncident(c.params.id);
  const all = rules();
  const ruleIds = [...new Set(i.deadlines.map((x) => x.ruleId))];
  i.deadlines = ruleIds.flatMap((rid) => {
    const r = all.find((x) => x.id === rid);
    return r ? computeDeadlines(r, i) : [];
  });
  tl(i, c.actor, "deadline", "Reporting deadlines recalculated with the current rules.", true);
  saveIncident(i, c.actor);
  audit(c.actor, "incident.reapply_rules", "incident", i.id, `${i.ref}: deadlines reapplied`, true);
  return i;
}

function incidentTrack(c: Ctx) {
  const ref = c.params.ref.trim();
  const i = loadAll<Incident>(incidentSpec, `lower("ref") = lower(?)`, [ref])[0];
  if (!i) return null;
  return {
    ref: i.ref,
    phase: i.phase,
    updatedAt: i.updatedAt,
    contact: i.classification === "normal" ? "Service Desk" : "Confidential Advisor",
  };
}

/* ---------- analytics ---------- */
function dashboard(c: Ctx): DashboardData {
  const p = c.query;
  const f: DashboardFilters = {
    days: num(p.get("days")) ?? 30,
    domain: (p.get("domain") || undefined) as DashboardFilters["domain"],
    processId: p.get("processId") || undefined,
    source: (p.get("source") || undefined) as DashboardFilters["source"],
    location: p.get("location") || undefined,
    businessUnit: p.get("businessUnit") || undefined,
    ctx: (p.get("ctx") as ViewContext) || "admin",
  };
  const nowD = new Date();
  const all = allIncidents();
  const match = (i: Incident) =>
    (!f.domain || i.domain === f.domain) &&
    (!f.processId || i.processId === f.processId) &&
    (!f.source || i.source === f.source) &&
    (!f.location || i.location === f.location) &&
    (!f.businessUnit || i.businessUnit === f.businessUnit);
  const created = (i: Incident) => new Date(i.createdAt).getTime();
  const to = nowD.getTime();
  const from = to - f.days * 864e5;
  const prevFrom = from - f.days * 864e5;
  const scoped = all.filter(match);
  const cur = scoped.filter((i) => created(i) > from && created(i) <= to);
  const prev = scoped.filter((i) => created(i) > prevFrom && created(i) <= from);
  const open = scoped.filter((i) => i.phase !== "close");
  /** Incidents that were open at the start of the period: the "previous" value for open counts. */
  const openAtFrom = scoped.filter(
    (i) => created(i) <= from && (!i.closedAt || new Date(i.closedAt).getTime() > from),
  );
  const serious = open.filter((i) => i.severity >= 3);
  const pendingDeadlines = (xs: Incident[]) =>
    xs.flatMap((i) => i.deadlines.filter((d) => d.status !== "submitted"));
  const dl = pendingDeadlines(open);
  const resp = (xs: Incident[]) =>
    median(
      xs
        .filter((i) => i.firstResponseAt)
        .map((i) => (new Date(i.firstResponseAt!).getTime() - created(i)) / 6e4),
    );
  const res = (xs: Incident[]) =>
    median(
      xs
        .filter((i) => i.resolvedAt)
        .map((i) => differenceInHours(new Date(i.resolvedAt!), new Date(i.createdAt))),
    );
  const sla = (xs: Incident[]) =>
    xs.length ? Math.round((xs.filter((i) => i.slaMet !== false).length / xs.length) * 100) : 100;
  const openActions = all.flatMap((i) => i.actions).filter((a) => !a.done).length;
  const kpis: DashboardData["kpis"] = [
    {
      key: "open",
      value: open.length,
      previous: openAtFrom.length,
      better: "down",
      link: { open: true },
    },
    {
      key: "new",
      value: cur.length,
      previous: prev.length,
      better: "down",
      link: { days: f.days },
    },
    {
      key: "serious",
      value: serious.length,
      previous: openAtFrom.filter((i) => i.severity >= 3).length,
      better: "down",
      link: { open: true, minSeverity: 3 },
    },
    {
      key: "response",
      value: Math.round(resp(cur)),
      previous: Math.round(resp(prev)),
      unit: "min",
      better: "down",
      link: { days: f.days },
    },
    {
      key: "resolution",
      value: Math.round(res(cur)),
      previous: Math.round(res(prev)),
      unit: "h",
      better: "down",
      link: { days: f.days },
    },
    {
      key: "sla",
      value: sla(cur),
      previous: sla(prev),
      unit: "%",
      better: "up",
      link: { days: f.days },
    },
    {
      key: "deadlines",
      value: dl.length,
      previous: pendingDeadlines(openAtFrom).length,
      better: "down",
      link: { open: true },
    },
    // No history of action states is kept, so there is no earlier value to compare with.
    {
      key: "actions",
      value: openActions,
      previous: openActions,
      better: "down",
      link: { open: false },
    },
  ];
  const funnel = [
    { stage: "All reports", value: cur.length, link: { days: f.days } },
    {
      stage: "Assessed",
      value: cur.filter((i) => i.phase !== "report").length,
      link: { days: f.days },
    },
    {
      stage: "Escalated",
      value: cur.filter((i) => i.level !== "standard").length,
      link: { days: f.days, level: "elevated" as LevelId },
    },
    {
      stage: "IRT activated",
      value: cur.filter((i) => i.level === "coordinated" || i.level === "critical").length,
      link: { days: f.days, level: "coordinated" as LevelId },
    },
    {
      stage: "CRT activated",
      value: cur.filter((i) => i.level === "critical").length,
      link: { days: f.days, level: "critical" as LevelId },
    },
  ];
  // Every week in the period, with every domain at 0, so stacked areas never have gaps or cross.
  const weekKey = (d: Date) => startOfWeek(d, { weekStartsOn: 1 }).toISOString().slice(0, 10);
  const emptyWeek = (w: string): Record<string, number | string> => ({
    week: w,
    ...Object.fromEntries(DOMAINS.map((d) => [d, 0])),
  });
  const weeks = new Map<string, Record<string, number | string>>();
  for (
    let ms = startOfWeek(new Date(from), { weekStartsOn: 1 }).getTime();
    ms <= to;
    ms += 7 * 864e5
  ) {
    const w = weekKey(new Date(ms));
    weeks.set(w, emptyWeek(w));
  }
  for (const i of cur) {
    const w = weekKey(new Date(i.createdAt));
    const row = weeks.get(w) ?? emptyWeek(w);
    row[i.domain] = ((row[i.domain] as number) ?? 0) + 1;
    weeks.set(w, row);
  }
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  cur.forEach((i) => heatmap[getDay(new Date(i.createdAt))][getHours(new Date(i.createdAt))]++);
  const sev = new Map<string, number>();
  cur.forEach((i) =>
    sev.set(`${i.severity}|${i.level}`, (sev.get(`${i.severity}|${i.level}`) ?? 0) + 1),
  );
  const top = (key: "service" | "location" | "category") => {
    const m = new Map<string, number>();
    cur.forEach((i) => m.set(i[key], (m.get(i[key]) ?? 0) + 1));
    return [...m]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  };
  const phaseHours = PHASES.map((ph) => ({
    phase: ph,
    hours: Math.round(median(cur.map((i) => i.phaseHours?.[ph] ?? 0).filter(Boolean)) * 10) / 10,
  }));
  const latest = scoped
    .flatMap((i) =>
      i.timeline.length
        ? i.timeline.map((t) => ({
            at: t.at,
            ref: i.ref,
            id: i.id,
            text: t.text,
            c: i.classification,
          }))
        : [{ at: i.createdAt, ref: i.ref, id: i.id, text: `New: ${i.title}`, c: i.classification }],
    )
    .filter((x) => isAfter(endOfDay(nowD), new Date(x.at)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12)
    .map(({ c: cls, ...x }) =>
      f.ctx !== "admin" && cls !== "normal"
        ? { ...x, text: "Update on a confidential incident" }
        : x,
    );
  const today = endOfDay(nowD).getTime();
  return {
    summary: {
      serious: serious.length,
      deadlinesToday: dl.filter((d) => new Date(d.dueAt).getTime() <= today).length,
      open: open.length,
    },
    kpis,
    funnel,
    volume: [...weeks.values()].sort((a, b) => String(a.week).localeCompare(String(b.week))),
    heatmap,
    severity: [...sev].map(([k, count]) => {
      const [s, l] = k.split("|");
      return { severity: Number(s) as Severity, level: l as LevelId, count };
    }),
    phaseHours,
    topServices: top("service"),
    topLocations: top("location"),
    topCategories: top("category"),
    latest,
    serious: serious
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 8)
      .map((i) => maskIncident(i, f.ctx)),
  };
}

/* ---------- contacts ---------- */
const allContacts = () => loadAll<Contact>(contactSpec, "", [], `"order"`);
const findContact = (id: string) => loadOne<Contact>(contactSpec, id) ?? notFound("Contact");

function contactsList(c: Ctx): Contact[] {
  const includeArchived = bool(c.query.get("includeArchived"));
  const s = c.query.get("search")?.toLowerCase();
  return allContacts()
    .filter((x) => includeArchived || !x.archived)
    .filter(
      (x) => !s || `${x.name} ${x.team} ${x.role} ${x.whenToContact}`.toLowerCase().includes(s),
    )
    .sort((a, b) => Number(b.emergency) - Number(a.emergency) || a.order - b.order);
}

function contactSave(id: string | null, input: ContactInput, actor: string): Contact {
  const at = now();
  const existing = id ? findContact(id) : undefined;
  let ct: Contact;
  if (existing) ct = { ...existing, ...input, updatedAt: at, updatedBy: actor };
  else {
    const order = allContacts().reduce((m, x) => Math.max(m, x.order + 1), 0);
    ct = {
      ...input,
      id: crypto.randomUUID(),
      order,
      archived: false,
      situationIds: [],
      processIds: [],
      lastVerifiedAt: at,
      verifiedBy: actor,
      createdAt: at,
      createdBy: actor,
      updatedAt: at,
      updatedBy: actor,
    };
  }
  save(contactSpec, ct);
  audit(
    actor,
    existing ? "contact.update" : "contact.create",
    "contact",
    ct.id,
    `${existing ? "Updated" : "Created"} contact ${ct.name}`,
  );
  return ct;
}

function contactMove(c: Ctx) {
  const dir = Number(c.body?.dir) as -1 | 1;
  const xs = allContacts().sort((a, b) => a.order - b.order);
  const i = xs.findIndex((x) => x.id === c.params.id);
  if (i < 0) notFound("Contact");
  const j = i + dir;
  if (j >= 0 && j < xs.length) {
    [xs[i].order, xs[j].order] = [xs[j].order, xs[i].order];
    save(contactSpec, xs[i]);
    save(contactSpec, xs[j]);
  }
  audit(c.actor, "contact.reorder", "contact", c.params.id, "Changed contact order");
  return null;
}

function contactsImport(c: Ctx): number {
  const csv = String(c.body?.csv ?? "");
  const org = settings().organization?.name ?? "";
  const lines = csv.trim().split(/\r?\n/).slice(1).filter(Boolean);
  conn().transaction(() => {
    for (const l of lines) {
      const [name, role, team, phone, email] = l.split(",").map((x) => x.trim());
      contactSave(
        null,
        {
          name,
          role: role || "Contact",
          team: team || "—",
          phone: phone || "",
          email: email || "",
          type: "person",
          organization: org,
          mobile: "",
          availability: "",
          timezone: "Europe/Amsterdam",
          outOfHours: "",
          whenToContact: "",
          backupId: "",
          notes: "Imported from CSV",
          emergency: false,
        },
        c.actor,
      );
    }
  })();
  return lines.length;
}

/* ---------- guidance ---------- */
function guidanceSaveDraft(id: string, content: GuidanceContent, actor: string): GuidanceSituation {
  const s = loadOne<GuidanceSituation>(guidanceSpec, id) ?? notFound("Situation");
  const latest = latestVersion(s);
  const at = now();
  if (latest.status === "draft") Object.assign(latest, { content, savedAt: at, savedBy: actor });
  else
    s.versions.push({
      version: latest.version + 1,
      status: "draft",
      savedAt: at,
      savedBy: actor,
      content,
    });
  save(guidanceSpec, s);
  audit(actor, "guidance.save_draft", "guidance", id, `Saved draft of “${content.title}”`);
  return s;
}

/* ---------- routes ---------- */
type Handler = (c: Ctx) => unknown;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, path: string, h: Handler) =>
  routes.push([method, new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => `(?<${k}>[^/]+)`)}$`), h]);

route("GET", "/health", () => ({ ok: true }));

route("GET", "/incidents", incidentsList);
route("GET", "/incidents/:id", (c) => loadOne<Incident>(incidentSpec, c.params.id) ?? null);
route("POST", "/incidents", incidentCreate);
route("PATCH", "/incidents/:id", incidentUpdate);
route("POST", "/incidents/:id/activations", incidentActivate);
route("POST", "/incidents/:id/deadlines/reapply", incidentReapply);
route("GET", "/public/track/:ref", incidentTrack);

route("GET", "/analytics/dashboard", dashboard);

route("GET", "/contacts", contactsList);
route("POST", "/contacts", (c) => contactSave(null, c.body, c.actor));
route("PUT", "/contacts/:id", (c) => contactSave(c.params.id, c.body, c.actor));
route("POST", "/contacts/:id/archive", (c) => {
  const ct = findContact(c.params.id);
  ct.archived = Boolean(c.body?.archived);
  save(contactSpec, ct);
  audit(
    c.actor,
    "contact.archive",
    "contact",
    ct.id,
    `${ct.archived ? "Archived" : "Restored"} contact ${ct.name}`,
  );
  return null;
});
route("POST", "/contacts/:id/move", contactMove);
route("POST", "/contacts/:id/verify", (c) => {
  const ct = findContact(c.params.id);
  ct.lastVerifiedAt = now();
  ct.verifiedBy = c.actor;
  save(contactSpec, ct);
  audit(c.actor, "contact.verify", "contact", ct.id, `Verified contact ${ct.name}`);
  return null;
});
route("POST", "/contacts/import", contactsImport);

// role.contactIds is derived from the contacts that fill the role (Contact.roleIds is the source).
route("GET", "/roles", () => {
  const contacts = loadAll<Contact>(contactSpec, `"archived" = 0`, [], `"order"`);
  return loadAll<Role>(roleSpec, "", [], `"name"`).map((r) => ({
    ...r,
    contactIds: contacts.filter((c) => c.roleIds?.includes(r.id)).map((c) => c.id),
  }));
});
route("PUT", "/roles/:id", (c) => {
  // contactIds is not stored on the role: who fills a role is set on the contact (Contact.roleIds).
  const role: Role = {
    ...(c.body as Role),
    id: c.params.id,
    contactIds: [],
    updatedAt: now(),
    updatedBy: c.actor,
  };
  const existing = loadOne<Role>(roleSpec, c.params.id);
  role.createdAt = existing?.createdAt ?? now();
  role.createdBy = existing?.createdBy ?? c.actor;
  save(roleSpec, role);
  audit(c.actor, "role.save", "role", role.id, `Saved role ${role.name}`);
  return role;
});
route("GET", "/raci", (c) => {
  const p = c.query.get("processId");
  return p
    ? loadAll<ResponsibilityAssignment>(raciSpec, `"process_id" = ?`, [p])
    : loadAll<ResponsibilityAssignment>(raciSpec);
});
route("PUT", "/raci/:id", (c) => {
  const a: ResponsibilityAssignment = { ...(c.body as ResponsibilityAssignment), id: c.params.id };
  save(raciSpec, a);
  audit(c.actor, "raci.update", "raci", a.id, `RACI ${a.roleId} / ${a.phase} set to ${a.value}`);
  return null;
});

route("GET", "/processes", () => loadAll<Process>(processSpec, "", [], `"name"`));
route("PUT", "/processes/:id", (c) => {
  const existing = loadOne<Process>(processSpec, c.params.id);
  const p: Process = {
    ...(c.body as Process),
    id: c.params.id,
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? now(),
    createdBy: existing?.createdBy ?? c.actor,
    updatedAt: now(),
    updatedBy: c.actor,
  };
  save(processSpec, p);
  audit(
    c.actor,
    "process.save",
    "process",
    p.id,
    `Saved process ${p.name} as version ${p.version}. Active incidents keep their version.`,
  );
  return p;
});

route("GET", "/guidance", situations);
route("GET", "/guidance/:id", (c) => findSituation(c.params.id) ?? null);
route("PUT", "/guidance/:id/draft", (c) => guidanceSaveDraft(c.params.id, c.body, c.actor));
route("POST", "/guidance/:id/versions/:v/status", (c) => {
  const s = loadOne<GuidanceSituation>(guidanceSpec, c.params.id) ?? notFound("Situation");
  const v = s.versions.find((x) => x.version === Number(c.params.v)) ?? notFound("Version");
  const status = c.body?.status as GuidanceStatus;
  if (status === "published")
    s.versions.forEach((x) => x.status === "published" && (x.status = "archived"));
  v.status = status;
  save(guidanceSpec, s);
  audit(
    c.actor,
    `guidance.${status}`,
    "guidance",
    s.id,
    `“${v.content.title}” v${v.version} → ${status}`,
  );
  return s;
});
route("POST", "/guidance/:id/versions/:v/restore", (c) => {
  const s = loadOne<GuidanceSituation>(guidanceSpec, c.params.id) ?? notFound("Situation");
  const v = s.versions.find((x) => x.version === Number(c.params.v)) ?? notFound("Version");
  const restored = guidanceSaveDraft(s.id, structuredClone(v.content), c.actor);
  audit(c.actor, "guidance.restore", "guidance", s.id, `Restored v${v.version} as a new draft`);
  return restored;
});

route("GET", "/reporting-rules", rules);
route("PUT", "/reporting-rules/:id", (c) => {
  const old = loadOne<ReportingRule>(ruleSpec, c.params.id);
  const r: ReportingRule = {
    ...(c.body as ReportingRule),
    id: c.params.id,
    updatedAt: now(),
    updatedBy: c.actor,
  };
  if (old) {
    r.version = old.version + 1;
    r.history = [
      { version: old.version, at: old.updatedAt, by: old.updatedBy, stages: old.stages },
      ...old.history,
    ];
    r.createdAt = old.createdAt;
    r.createdBy = old.createdBy;
  } else {
    r.version = Math.max(1, r.version || 0);
    r.history = [];
    r.createdAt = now();
    r.createdBy = c.actor;
  }
  save(ruleSpec, r);
  audit(
    c.actor,
    "rule.save",
    "reporting_rule",
    r.id,
    `Saved reporting rule ${r.name} v${r.version}. Applies to new incidents.`,
  );
  return r;
});

route("GET", "/sources", () => loadAll<SourceSystem>(sourceSpec, "", [], `"name"`));
// Connectors are not implemented yet: there is nothing to preview or import.
route("GET", "/sources/:id/preview", (c) => {
  if (!loadOne<SourceSystem>(sourceSpec, c.params.id)) notFound("Source");
  return [];
});
route("POST", "/sources/:id/import", (c) => {
  const s = loadOne<SourceSystem>(sourceSpec, c.params.id) ?? notFound("Source");
  audit(
    c.actor,
    "source.import",
    "source",
    s.id,
    `Import from ${s.name} requested; no connector is configured yet`,
  );
  return { imported: 0, duplicates: 0 };
});

route("GET", "/settings", settings);
route("PUT", "/settings/secrets/:key", (c) => {
  setSecret(c.params.key, String(c.body?.value ?? ""), c.actor);
  audit(c.actor, "settings.secret", "settings", c.params.key, `Secret “${c.params.key}” replaced`);
  return null;
});
route("PUT", "/settings/:section", (c) => {
  const section = c.params.section as (typeof SETTING_SECTIONS)[number];
  if (!SETTING_SECTIONS.includes(section))
    throw new HttpError(400, `Unknown settings section ${section}`);
  setSettingSection(section, c.body);
  addSettingsHistory(now(), c.actor, section, `Updated ${section}`);
  audit(c.actor, "settings.update", "settings", section, `Changed settings: ${section}`);
  return settings();
});
route("POST", "/settings/database/test", () => {
  const t0 = performance.now();
  const v = conn().query<{ v: string }>("SELECT sqlite_version() AS v").get()?.v;
  conn().query("SELECT count(*) FROM incidents").get();
  return {
    ok: true,
    message: `SQLite ${v} · ${DB_PATH}`,
    ms: Math.round((performance.now() - t0) * 10) / 10,
  };
});

route("GET", "/audit", (c) => auditList(num(c.query.get("limit")) ?? 200));

route("GET", "/system/info", (): SystemInfo => {
  const page = conn()
    .query<{ n: number }>(
      "SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()",
    )
    .get();
  return {
    version: VERSION,
    runtime: `Bun ${Bun.version}`,
    sqliteVersion: conn().query<{ v: string }>("SELECT sqlite_version() AS v").get()?.v ?? "?",
    schemaVersion: SCHEMA_VERSION,
    dbPath: DB_PATH,
    dbSizeBytes: page?.n ?? 0,
    createdAt: getMeta("created_at"),
    startedAt: STARTED_AT,
  };
});

/* ---------- templates and first setup ---------- */
const templateKind = (k: string): TemplateKind => {
  if (!(TEMPLATE_KINDS as readonly string[]).includes(k))
    throw new HttpError(404, `Unknown template kind ${k}`);
  return k as TemplateKind;
};
route("GET", "/templates/playbooks", () => PLAYBOOKS);
route("GET", "/templates/master-data", () => MASTER_DATA_EXAMPLES);
route("GET", "/templates/:kind", (c) => listTemplates(templateKind(c.params.kind)));
route("POST", "/templates/:kind/apply", (c) => {
  const ids = Array.isArray(c.body?.ids) ? (c.body.ids as unknown[]).map(String) : [];
  return applyTemplates(templateKind(c.params.kind), ids, c.actor);
});

const COUNT_TABLES: Record<TemplateKind, string> = {
  contacts: "contacts",
  roles: "roles",
  rules: "reporting_rules",
  processes: "processes",
  guidance: "guidance_situations",
  sources: "source_systems",
};
route("GET", "/setup", () => {
  const counts = Object.fromEntries(
    TEMPLATE_KINDS.map((k) => [
      k,
      conn().query<{ n: number }>(`SELECT count(*) AS n FROM "${COUNT_TABLES[k]}"`).get()?.n ?? 0,
    ]),
  ) as Record<TemplateKind, number>;
  const completedAt = getMeta("setup_completed_at");
  return { completed: !!completedAt, completedAt, counts };
});
route("POST", "/setup/demo", (c) => loadDemo(c.actor));
route("POST", "/setup/complete", (c) => {
  if (!getMeta("setup_completed_at")) {
    setMeta("setup_completed_at", now());
    audit(
      c.actor,
      "setup.complete",
      "system",
      "-",
      c.body?.skipped ? "First setup skipped" : "First setup completed",
    );
  }
  return null;
});

export async function handleApi(req: Request, path: string): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data ?? null), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  for (const [method, re, h] of routes) {
    if (method !== req.method) continue;
    const m = re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(
      Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]),
    );
    try {
      const body =
        req.method === "GET"
          ? undefined
          : await req.text().then((t) => (t ? JSON.parse(t) : undefined));
      const actorHeader = req.headers.get("x-irtrack-actor");
      const actor = actorHeader ? decodeURIComponent(actorHeader).slice(0, 200) : "anonymous";
      return json(await h({ params, query: new URL(req.url).searchParams, body, actor }));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
      console.error(`[api] ${req.method} ${path}`, e);
      return json({ error: "Internal server error" }, 500);
    }
  }
  return json({ error: `No route for ${req.method} /api${path}` }, 404);
}
