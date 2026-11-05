/**
 * Applies templates from server/templates.ts to the database.
 *
 * Dependencies are added automatically (a process brings its roles and reporting rules, a
 * guidance situation brings its process and roles). References to things that do not exist
 * (for example contacts that were not added) are dropped, and links are restored when the
 * missing item is added later.
 */
import type { Aggregate } from "./schema";
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
import {
  audit,
  conn,
  getMeta,
  loadAll,
  loadOne,
  save,
  saveMany,
  setMeta,
  setSettingSection,
} from "./db";
import { HttpError } from "./errors";
import * as demo from "./demo";
import {
  buildContacts,
  buildProcesses,
  buildRaci,
  buildRoles,
  buildRules,
  buildSituations,
  buildSources,
} from "./templates";
import type {
  Contact,
  GuidanceSituation,
  Process,
  ReportingRule,
  Role,
  SourceSystem,
  TemplateApplyResult,
  TemplateItem,
  TemplateKind,
} from "../src/domain/types";

type Entity = Contact | Role | ReportingRule | Process | GuidanceSituation | SourceSystem;

const SPEC: Record<TemplateKind, Aggregate> = {
  contacts: contactSpec,
  roles: roleSpec,
  rules: ruleSpec,
  processes: processSpec,
  guidance: guidanceSpec,
  sources: sourceSpec,
};

function catalog(): Record<TemplateKind, Entity[]> {
  const now = new Date();
  const iso = now.toISOString();
  return {
    contacts: buildContacts(now),
    roles: buildRoles(iso),
    rules: buildRules(now),
    processes: buildProcesses(iso),
    guidance: buildSituations(now),
    sources: buildSources(now),
  };
}

const nameOf = (kind: TemplateKind, e: Entity): string =>
  kind === "guidance"
    ? (e as GuidanceSituation).versions[0].content.title
    : (e as { name: string }).name;

function describe(kind: TemplateKind, e: Entity): { description: string; group?: string } {
  switch (kind) {
    case "contacts": {
      const c = e as Contact;
      return { description: `${c.role} · ${c.whenToContact}`, group: c.type };
    }
    case "roles":
      return { description: (e as Role).summary };
    case "rules": {
      const r = e as ReportingRule;
      return {
        description: `${r.legalBasis} · ${r.stages.map((s) => `${s.label}: ${s.amount} ${s.unit}`).join(" → ")}`,
        group: r.jurisdiction,
      };
    }
    case "processes": {
      const p = e as Process;
      return { description: p.purpose, group: p.domain };
    }
    case "guidance": {
      const c = (e as GuidanceSituation).versions[0].content;
      return { description: c.description, group: c.category };
    }
    case "sources":
      return {
        description:
          "Field and value mapping for importing incidents. The connector itself is configured later.",
      };
  }
}

/** Other templates this one needs, as [kind, id]. */
function deps(kind: TemplateKind, e: Entity): [TemplateKind, string][] {
  if (kind === "processes") {
    const p = e as Process;
    return [
      ...p.roleIds.map((id): [TemplateKind, string] => ["roles", id]),
      ...p.reportingRuleIds.map((id): [TemplateKind, string] => ["rules", id]),
    ];
  }
  if (kind === "guidance") {
    const c = (e as GuidanceSituation).versions[0].content;
    const flowRoles = c.flowchart.nodes.filter((n) => n.ref?.kind === "role").map((n) => n.ref!.id);
    return [
      ["processes", c.processId],
      ...[...new Set([...c.roleIds, ...flowRoles])].map((id): [TemplateKind, string] => [
        "roles",
        id,
      ]),
    ];
  }
  return [];
}

const exists = (kind: TemplateKind, id: string) => !!loadOne(SPEC[kind], id);
const existing = (kind: TemplateKind, ids: string[]) => ids.filter((id) => exists(kind, id));

export function listTemplates(kind: TemplateKind): TemplateItem[] {
  const cat = catalog();
  const find = (k: TemplateKind, id: string) => cat[k].find((x) => x.id === id);
  return cat[kind].map((e) => ({
    id: e.id,
    name: nameOf(kind, e),
    ...describe(kind, e),
    exists: exists(kind, e.id),
    requires: deps(kind, e).flatMap(([k, id]) => {
      const d = find(k, id);
      return d ? [nameOf(k, d)] : [];
    }),
  }));
}

/** Prepares a template for insertion: drops references to things that do not exist. */
function prepare(kind: TemplateKind, e: Entity, actor: string): Entity {
  const at = new Date().toISOString();
  const stamp = { createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
  switch (kind) {
    case "contacts": {
      const c = e as Contact;
      return {
        ...c,
        ...stamp,
        roleIds: existing("roles", c.roleIds ?? []),
        backupId: c.backupId && exists("contacts", c.backupId) ? c.backupId : "",
        lastVerifiedAt: at,
        verifiedBy: actor,
        order: nextContactOrder(),
      };
    }
    case "roles": {
      // Who fills a role is stored on the contact (Contact.roleIds).
      return { ...(e as Role), ...stamp, contactIds: [] };
    }
    case "rules": {
      const r = e as ReportingRule;
      return { ...r, ...stamp, processIds: existing("processes", r.processIds), effectiveFrom: at };
    }
    case "processes": {
      const p = e as Process;
      return {
        ...p,
        ...stamp,
        roleIds: existing("roles", p.roleIds),
        reportingRuleIds: existing("rules", p.reportingRuleIds),
      };
    }
    case "guidance": {
      const s = e as GuidanceSituation;
      const v = s.versions[0];
      const content = {
        ...v.content,
        contactIds: existing("contacts", v.content.contactIds),
        roleIds: existing("roles", v.content.roleIds),
        flowchart: {
          ...v.content.flowchart,
          nodes: v.content.flowchart.nodes.map((n) => {
            if (!n.ref) return n;
            const k: TemplateKind | null =
              n.ref.kind === "contact"
                ? "contacts"
                : n.ref.kind === "role"
                  ? "roles"
                  : n.ref.kind === "process"
                    ? "processes"
                    : null;
            return k && !exists(k, n.ref.id) ? { ...n, ref: undefined } : n;
          }),
        },
      };
      return { ...s, versions: [{ ...v, savedAt: at, savedBy: actor, content }] };
    }
    case "sources":
      return { ...(e as SourceSystem), lastSyncAt: at };
  }
}

function nextContactOrder() {
  return loadAll<Contact>(contactSpec).reduce((m, c) => Math.max(m, c.order + 1), 0);
}

/** Restores links from already existing items to an item that was just added. */
function relink(kind: TemplateKind, id: string, cat: Record<TemplateKind, Entity[]>) {
  if (kind === "roles") {
    // Contacts added earlier from templates now get the role they were meant to fill.
    for (const c of loadAll<Contact>(contactSpec)) {
      const tpl = cat.contacts.find((x) => x.id === c.id) as Contact | undefined;
      if (tpl?.roleIds?.includes(id) && !c.roleIds?.includes(id))
        save(contactSpec, { ...c, roleIds: [...(c.roleIds ?? []), id] });
    }
  }
  if (kind === "contacts") {
    for (const c of loadAll<Contact>(contactSpec)) {
      const tpl = cat.contacts.find((x) => x.id === c.id) as Contact | undefined;
      if (tpl?.backupId === id && !c.backupId) save(contactSpec, { ...c, backupId: id });
    }
  }
  if (kind === "processes") {
    for (const r of loadAll<ReportingRule>(ruleSpec)) {
      const tpl = cat.rules.find((x) => x.id === r.id) as ReportingRule | undefined;
      if (tpl?.processIds.includes(id) && !r.processIds.includes(id))
        save(ruleSpec, { ...r, processIds: [...r.processIds, id] });
    }
  }
  if (kind === "roles" || kind === "rules") {
    const field = kind === "roles" ? "roleIds" : "reportingRuleIds";
    for (const p of loadAll<Process>(processSpec)) {
      const tpl = cat.processes.find((x) => x.id === p.id) as Process | undefined;
      if (tpl?.[field].includes(id) && !p[field].includes(id)) {
        save(processSpec, { ...p, [field]: [...p[field], id] });
        if (kind === "roles") addRaci(tpl, [id]);
      }
    }
  }
}

/** RACI rows from the template table for the given roles of a process. */
function addRaci(p: Process, roleIds: string[]) {
  for (const a of buildRaci([{ ...p, roleIds }])) if (!loadOne(raciSpec, a.id)) save(raciSpec, a);
}

export function applyTemplates(
  kind: TemplateKind,
  ids: string[],
  actor: string,
): TemplateApplyResult {
  const cat = catalog();
  const find = (k: TemplateKind, id: string) => cat[k].find((x) => x.id === id);
  const order: [TemplateKind, string][] = [];
  const seen = new Set<string>();
  const collect = (k: TemplateKind, id: string) => {
    const key = `${k}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const e = find(k, id);
    if (!e) return;
    deps(k, e).forEach(([dk, did]) => collect(dk, did));
    order.push([k, id]);
  };
  ids.forEach((id) => collect(kind, id));

  const result: TemplateApplyResult = { added: [], skipped: [] };
  conn().transaction(() => {
    for (const [k, id] of order) {
      const e = find(k, id)!;
      const item = { kind: k, id, name: nameOf(k, e) };
      if (exists(k, id)) {
        if (k === kind && ids.includes(id)) result.skipped.push(item);
        continue;
      }
      const prepared = prepare(k, e, actor);
      save(SPEC[k], prepared);
      if (k === "processes") addRaci(prepared as Process, (prepared as Process).roleIds);
      relink(k, id, cat);
      audit(
        actor,
        "template.apply",
        k,
        id,
        `Added ${k.replace(/s$/, "")} “${item.name}” from template`,
      );
      result.added.push(item);
    }
  })();
  return result;
}

/**
 * Fills an empty database with the complete demo data set (fictional "Northshore Municipality")
 * and marks the setup as done. Refused once the setup is completed or incidents exist.
 */
export function loadDemo(actor: string): { incidents: number } {
  if (getMeta("setup_completed_at"))
    throw new HttpError(
      409,
      "Setup is already completed; demo data can only be loaded into a new database.",
    );
  if ((conn().query<{ n: number }>(`SELECT count(*) AS n FROM "incidents"`).get()?.n ?? 0) > 0)
    throw new HttpError(409, "The database already contains incidents.");
  const now = new Date();
  const iso = now.toISOString();
  const processes = demo.buildProcesses(iso);
  const rules = demo.buildRules(now);
  const incidents = [...demo.buildDemoIncidents(now, rules), ...demo.generateHistory(now)];
  const { secrets: _s, history: _h, ...sections } = demo.buildSettings();
  conn().transaction(() => {
    saveMany(contactSpec, demo.buildContacts(now));
    saveMany(roleSpec, demo.buildRoles(iso));
    saveMany(processSpec, processes);
    saveMany(raciSpec, demo.buildRaci(processes));
    saveMany(ruleSpec, rules);
    saveMany(guidanceSpec, demo.buildSituations(now));
    saveMany(sourceSpec, demo.buildSources(now));
    for (const [section, value] of Object.entries(sections)) setSettingSection(section, value);
    saveMany(incidentSpec, incidents);
    setMeta("demo_loaded_at", iso);
    setMeta("setup_completed_at", iso);
    audit(
      actor,
      "system.demo",
      "system",
      "-",
      `Demo data loaded (Northshore Municipality, ${incidents.length} incidents)`,
      true,
    );
  })();
  return { incidents: incidents.length };
}
