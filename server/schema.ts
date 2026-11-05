/**
 * SQLite schema for IRTrack, derived 1:1 from the types in src/domain/types.ts.
 *
 * Each TableSpec is the single source for both the DDL and the row <-> object mapping:
 * - field names are the TypeScript property names; columns are their snake_case form
 * - "json" columns hold arrays/objects that are part of the parent record
 * - collections that are records of their own (incident tasks, timeline, ...) get a child table
 *
 * Changing the schema of an existing database needs a migration in db.ts (PRAGMA user_version).
 */

export type ColType = "text" | "int" | "real" | "bool" | "json";

export interface TableSpec {
  table: string;
  /** Primary key fields (within the parent for child tables). */
  key: string[];
  cols: Record<string, ColType>;
  /** Child tables: the column that points to the parent row. */
  parentColumn?: string;
  parentTable?: string;
}

export interface Aggregate {
  main: TableSpec;
  children: { field: string; spec: TableSpec }[];
}

export const snake = (f: string) => f.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

const AUDITED: Record<string, ColType> = {
  createdAt: "text",
  createdBy: "text",
  updatedAt: "text",
  updatedBy: "text",
};

const child = (
  table: string,
  parentTable: string,
  parentColumn: string,
  cols: Record<string, ColType>,
  key = ["id"],
): TableSpec => ({
  table,
  key,
  cols,
  parentTable,
  parentColumn,
});

/* ---------- incidents ---------- */
export const incidentSpec: Aggregate = {
  main: {
    table: "incidents",
    key: ["id"],
    cols: {
      id: "text",
      ref: "text",
      title: "text",
      description: "text",
      processId: "text",
      processVersion: "int",
      domain: "text",
      source: "text",
      sourceId: "text",
      sourceUrl: "text",
      lastSyncAt: "text",
      sourceFields: "json",
      severity: "int",
      level: "text",
      phase: "text",
      classification: "text",
      tlp: "text",
      ownerId: "text",
      location: "text",
      service: "text",
      businessUnit: "text",
      category: "text",
      startedAt: "text",
      detectedAt: "text",
      awareAt: "text",
      firstResponseAt: "text",
      resolvedAt: "text",
      closedAt: "text",
      phaseHours: "json",
      slaMet: "bool",
      personalData: "bool",
      nextStep: "text",
      relatedIds: "json",
      suggestion: "json",
      reviewNotes: "text",
      ...AUDITED,
    },
  },
  children: [
    {
      field: "tasks",
      spec: child("incident_tasks", "incidents", "incident_id", {
        id: "text",
        title: "text",
        phase: "text",
        roleId: "text",
        done: "bool",
      }),
    },
    {
      field: "decisions",
      spec: child("incident_decisions", "incidents", "incident_id", {
        id: "text",
        what: "text",
        why: "text",
        by: "text",
        at: "text",
        override: "bool",
      }),
    },
    {
      field: "timeline",
      spec: child("incident_timeline", "incidents", "incident_id", {
        id: "text",
        at: "text",
        actor: "text",
        kind: "text",
        text: "text",
        highlight: "bool",
      }),
    },
    {
      field: "comms",
      spec: child("incident_comms", "incidents", "incident_id", {
        id: "text",
        audience: "text",
        title: "text",
        body: "text",
        status: "text",
        at: "text",
      }),
    },
    {
      field: "attachments",
      spec: child("incident_attachments", "incidents", "incident_id", {
        id: "text",
        name: "text",
        size: "int",
        at: "text",
        by: "text",
      }),
    },
    {
      field: "actions",
      spec: child("incident_actions", "incidents", "incident_id", {
        id: "text",
        title: "text",
        owner: "text",
        due: "text",
        done: "bool",
      }),
    },
    {
      field: "deadlines",
      spec: child("incident_deadlines", "incidents", "incident_id", {
        id: "text",
        ruleId: "text",
        ruleVersion: "int",
        ruleName: "text",
        stage: "text",
        dueAt: "text",
        status: "text",
        ownerRole: "text",
        draft: "text",
      }),
    },
    {
      field: "activations",
      spec: child("incident_activations", "incidents", "incident_id", {
        id: "text",
        team: "text",
        at: "text",
        by: "text",
        rationale: "text",
        departments: "json",
        happening: "bool",
        critical: "bool",
        override: "bool",
        stoodDownAt: "text",
        standDownRationale: "text",
      }),
    },
  ],
};

/* ---------- configuration and people ---------- */
export const contactSpec: Aggregate = {
  main: {
    table: "contacts",
    key: ["id"],
    cols: {
      id: "text",
      name: "text",
      type: "text",
      role: "text",
      team: "text",
      organization: "text",
      phone: "text",
      mobile: "text",
      email: "text",
      availability: "text",
      timezone: "text",
      outOfHours: "text",
      whenToContact: "text",
      backupId: "text",
      notes: "text",
      emergency: "bool",
      escalationLevel: "text",
      roleIds: "json",
      order: "int",
      archived: "bool",
      situationIds: "json",
      processIds: "json",
      lastVerifiedAt: "text",
      verifiedBy: "text",
      ...AUDITED,
    },
  },
  children: [],
};

export const roleSpec: Aggregate = {
  main: {
    table: "roles",
    key: ["id"],
    cols: {
      id: "text",
      name: "text",
      summary: "text",
      level: "text",
      responsibilities: "json",
      skills: "json",
      decides: "json",
      contactIds: "json",
      onEscalation: "text",
      ...AUDITED,
    },
  },
  children: [],
};

export const processSpec: Aggregate = {
  main: {
    table: "processes",
    key: ["id"],
    cols: {
      id: "text",
      name: "text",
      purpose: "text",
      domain: "text",
      version: "int",
      phaseNames: "json",
      levelNames: "json",
      roleIds: "json",
      triage: "json",
      tasks: "json",
      reportingRuleIds: "json",
      templates: "json",
      irtCriteria: "text",
      crtCriteria: "text",
      situationIds: "json",
      alias: "json",
      ...AUDITED,
    },
  },
  children: [],
};

export const raciSpec: Aggregate = {
  main: {
    table: "raci",
    key: ["id"],
    cols: { id: "text", processId: "text", roleId: "text", phase: "text", value: "text" },
  },
  children: [],
};

export const ruleSpec: Aggregate = {
  main: {
    table: "reporting_rules",
    key: ["id"],
    cols: {
      id: "text",
      version: "int",
      name: "text",
      legalBasis: "text",
      regulator: "text",
      jurisdiction: "text",
      processIds: "json",
      trigger: "text",
      anchor: "text",
      stages: "json",
      reminders: "text",
      ownerRole: "text",
      effectiveFrom: "text",
      active: "bool",
      ...AUDITED,
    },
  },
  children: [
    {
      field: "history",
      spec: child(
        "reporting_rule_versions",
        "reporting_rules",
        "rule_id",
        { version: "int", at: "text", by: "text", stages: "json" },
        ["version"],
      ),
    },
  ],
};

export const guidanceSpec: Aggregate = {
  main: { table: "guidance_situations", key: ["id"], cols: { id: "text", slug: "text" } },
  children: [
    {
      field: "versions",
      spec: child(
        "guidance_versions",
        "guidance_situations",
        "situation_id",
        { version: "int", status: "text", savedAt: "text", savedBy: "text", content: "json" },
        ["version"],
      ),
    },
  ],
};

export const sourceSpec: Aggregate = {
  main: {
    table: "source_systems",
    key: ["id"],
    cols: {
      id: "text",
      name: "text",
      status: "text",
      lastSyncAt: "text",
      fieldMap: "json",
      valueMap: "json",
      errors: "json",
    },
  },
  children: [],
};

export const auditSpec: Aggregate = {
  main: {
    table: "audit_events",
    key: ["id"],
    cols: {
      id: "text",
      at: "text",
      actor: "text",
      action: "text",
      entity: "text",
      entityId: "text",
      summary: "text",
      highlight: "bool",
    },
  },
  children: [],
};

export const AGGREGATES = [
  incidentSpec,
  contactSpec,
  roleSpec,
  processSpec,
  raciSpec,
  ruleSpec,
  guidanceSpec,
  sourceSpec,
  auditSpec,
];

const SQL_TYPE: Record<ColType, string> = {
  text: "TEXT",
  int: "INTEGER",
  real: "REAL",
  bool: "INTEGER",
  json: "TEXT",
};
export const q = (name: string) => `"${name}"`;

function tableDdl(s: TableSpec): string {
  const lines: string[] = [];
  if (s.parentColumn) {
    lines.push(
      `${q(s.parentColumn)} TEXT NOT NULL REFERENCES ${q(s.parentTable!)}("id") ON DELETE CASCADE`,
    );
    lines.push(`"position" INTEGER NOT NULL`);
  }
  for (const [f, t] of Object.entries(s.cols))
    lines.push(`${q(snake(f))} ${SQL_TYPE[t]}${s.key.includes(f) ? " NOT NULL" : ""}`);
  const pk = [...(s.parentColumn ? [s.parentColumn] : []), ...s.key.map(snake)];
  lines.push(`PRIMARY KEY (${pk.map(q).join(", ")})`);
  return `CREATE TABLE ${q(s.table)} (\n  ${lines.join(",\n  ")}\n);`;
}

/** Version 1 of the schema, one SQL statement per entry. */
export function schemaV1(): string[] {
  const parts: string[] = [];
  for (const a of AGGREGATES) {
    parts.push(tableDdl(a.main));
    for (const c of a.children) parts.push(tableDdl(c.spec));
  }
  parts.push(
    `CREATE TABLE "settings" ("section" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL);`,
    `CREATE TABLE "settings_history" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "at" TEXT NOT NULL, "by" TEXT NOT NULL, "section" TEXT NOT NULL, "summary" TEXT NOT NULL);`,
    // Secret values are write-only through the API: they are stored here but never returned.
    `CREATE TABLE "secrets" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "updated_by" TEXT NOT NULL);`,
    `CREATE TABLE "meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL);`,
    `CREATE UNIQUE INDEX "incidents_ref" ON "incidents" ("ref");`,
    `CREATE INDEX "incidents_created_at" ON "incidents" ("created_at");`,
    `CREATE INDEX "incidents_phase" ON "incidents" ("phase");`,
    `CREATE UNIQUE INDEX "guidance_slug" ON "guidance_situations" ("slug");`,
    `CREATE INDEX "raci_process" ON "raci" ("process_id");`,
    `CREATE INDEX "audit_at" ON "audit_events" ("at");`,
    // The audit trail is append-only.
    `CREATE TRIGGER "audit_no_update" BEFORE UPDATE ON "audit_events" BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;`,
    `CREATE TRIGGER "audit_no_delete" BEFORE DELETE ON "audit_events" BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;`,
  );
  return parts;
}
