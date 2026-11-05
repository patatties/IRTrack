import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditEvent } from "../src/domain/types";
import {
  AGGREGATES,
  auditSpec,
  q,
  schemaV1,
  snake,
  type Aggregate,
  type TableSpec,
} from "./schema";

export const DB_PATH = process.env.IRTRACK_DB ?? "./data/irtrack.db";
export const SCHEMA_VERSION = 4;

type Row = Record<string, unknown>;
type Obj = Record<string, unknown>;

let db: Database;

/** Opens (and if needed creates and migrates) the database. A new database stays empty: it is filled in the setup wizard. */
export function openDb(): Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate();
  if (!getMeta("created_at")) {
    db.transaction(() => {
      setMeta("created_at", new Date().toISOString());
      audit("system", "system.create", "system", "-", "Empty database created.");
    })();
    console.log("[db] new empty database created");
  }
  return db;
}

export const conn = () => db;

function migrate() {
  const current = (db.query<{ user_version: number }>("PRAGMA user_version").get()?.user_version ??
    0) as number;
  if (current > SCHEMA_VERSION)
    throw new Error(`Database schema v${current} is newer than this IRTrack (v${SCHEMA_VERSION}).`);
  const steps: Record<number, () => void> = {
    1: () => schemaV1().forEach((sql) => db.exec(sql)),
    // v2: escalation ladder for contacts. New databases already get the column from schemaV1.
    2: () => addColumnIfMissing("contacts", "escalation_level", "TEXT"),
    // v3: escalation level for roles.
    3: () => addColumnIfMissing("roles", "level", "TEXT"),
    // v4: contacts fill roles (contact.roleIds is the source; role.contactIds is derived). Backfill from role.contact_ids.
    4: () => {
      addColumnIfMissing("contacts", "role_ids", "TEXT");
      const links = new Map<string, string[]>();
      for (const r of db
        .query<{ id: string; contact_ids: string | null }>(
          `SELECT "id", "contact_ids" FROM "roles"`,
        )
        .all())
        for (const cid of JSON.parse(r.contact_ids ?? "[]") as string[])
          links.set(cid, [...(links.get(cid) ?? []), r.id]);
      for (const [cid, roleIds] of links)
        db.query(`UPDATE "contacts" SET "role_ids" = ? WHERE "id" = ? AND "role_ids" IS NULL`).run(
          JSON.stringify(roleIds),
          cid,
        );
    },
  };
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    db.transaction(() => {
      steps[v]();
      db.exec(`PRAGMA user_version = ${v}`);
    })();
    console.log(`[db] migrated to schema v${v}`);
  }
}

function addColumnIfMissing(table: string, column: string, type: string) {
  const cols = db.query<{ name: string }>(`PRAGMA table_info("${table}")`).all();
  if (!cols.some((c) => c.name === column))
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
}

/* ---------- row <-> object mapping ---------- */
function toValues(obj: Obj, s: TableSpec): (string | number | null)[] {
  return Object.entries(s.cols).map(([f, t]) => {
    const v = obj[f];
    if (v === undefined || v === null) return null;
    if (t === "json") return JSON.stringify(v);
    if (t === "bool") return v ? 1 : 0;
    if (t === "int" || t === "real") return Number(v);
    return String(v);
  });
}

function fromRow(row: Row, s: TableSpec): Obj {
  const out: Obj = {};
  for (const [f, t] of Object.entries(s.cols)) {
    const v = row[snake(f)];
    if (v === null || v === undefined) continue;
    out[f] = t === "json" ? JSON.parse(String(v)) : t === "bool" ? Boolean(v) : v;
  }
  return out;
}

const colList = (s: TableSpec) => Object.keys(s.cols).map((f) => q(snake(f)));

function upsertSql(s: TableSpec): string {
  const cols = colList(s);
  const keys = s.key.map((k) => q(snake(k)));
  const updates = cols.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`);
  return `INSERT INTO ${q(s.table)} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT (${keys.join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`;
}

function childInsertSql(s: TableSpec): string {
  const cols = [q(s.parentColumn!), `"position"`, ...colList(s)];
  return `INSERT INTO ${q(s.table)} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
}

/* ---------- generic aggregate store ---------- */
export function loadAll<T>(
  a: Aggregate,
  where = "",
  params: (string | number)[] = [],
  orderBy = "",
): T[] {
  const rows = db
    .query<Row>(
      `SELECT * FROM ${q(a.main.table)} ${where ? `WHERE ${where}` : ""} ${orderBy ? `ORDER BY ${orderBy}` : ""}`,
    )
    .all(...params);
  const objs = rows.map((r) => fromRow(r, a.main));
  if (!a.children.length || !objs.length) {
    for (const o of objs) for (const c of a.children) o[c.field] = [];
    return objs as T[];
  }
  const byId = new Map(objs.map((o) => [String(o.id), o]));
  for (const c of a.children) {
    for (const o of objs) o[c.field] = [];
    const ids = [...byId.keys()];
    // Load children in chunks to stay below SQLite's parameter limit.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const childRows = db
        .query<Row>(
          `SELECT * FROM ${q(c.spec.table)} WHERE ${q(c.spec.parentColumn!)} IN (${chunk.map(() => "?").join(",")}) ORDER BY ${q(c.spec.parentColumn!)}, "position"`,
        )
        .all(...chunk);
      for (const r of childRows)
        (byId.get(String(r[c.spec.parentColumn!]))![c.field] as Obj[]).push(fromRow(r, c.spec));
    }
  }
  return objs as T[];
}

export function loadOne<T>(a: Aggregate, id: string): T | undefined {
  return loadAll<T>(a, `"id" = ?`, [id])[0];
}

export function save<T extends object>(a: Aggregate, obj: T): T {
  const o = obj as unknown as Obj;
  db.transaction(() => {
    db.query(upsertSql(a.main)).run(...toValues(o, a.main));
    for (const c of a.children) {
      db.query(`DELETE FROM ${q(c.spec.table)} WHERE ${q(c.spec.parentColumn!)} = ?`).run(
        String(o.id),
      );
      const ins = db.query(childInsertSql(c.spec));
      ((o[c.field] as Obj[] | undefined) ?? []).forEach((item, pos) =>
        ins.run(String(o.id), pos, ...toValues(item, c.spec)),
      );
    }
  })();
  return obj;
}

export function saveMany<T extends object>(a: Aggregate, objs: T[]) {
  db.transaction(() => objs.forEach((o) => save(a, o)))();
}

/* ---------- meta, settings, secrets ---------- */
export function getMeta(key: string): string | undefined {
  return db.query<{ value: string }>(`SELECT "value" FROM "meta" WHERE "key" = ?`).get(key)?.value;
}
export function setMeta(key: string, value: string) {
  db.query(
    `INSERT INTO "meta" ("key", "value") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"`,
  ).run(key, value);
}
/** Atomically increments a counter in meta and returns the new value. */
export function nextSeq(key: string): number {
  return db.transaction(() => {
    const n = Number(getMeta(key) ?? "0") + 1;
    setMeta(key, String(n));
    return n;
  })();
}

export function getSettingSections(): Record<string, unknown> {
  const rows = db
    .query<{ section: string; value: string }>(`SELECT "section", "value" FROM "settings"`)
    .all();
  return Object.fromEntries(rows.map((r) => [r.section, JSON.parse(r.value)]));
}
export function setSettingSection(section: string, value: unknown) {
  db.query(
    `INSERT INTO "settings" ("section", "value") VALUES (?, ?) ON CONFLICT ("section") DO UPDATE SET "value" = excluded."value"`,
  ).run(section, JSON.stringify(value));
}
export function addSettingsHistory(at: string, by: string, section: string, summary: string) {
  db.query(
    `INSERT INTO "settings_history" ("at", "by", "section", "summary") VALUES (?, ?, ?, ?)`,
  ).run(at, by, section, summary);
}
export function settingsHistory(limit = 200) {
  return db
    .query<{ at: string; by: string; section: string; summary: string }>(
      `SELECT "at", "by", "section", "summary" FROM "settings_history" ORDER BY "id" DESC LIMIT ?`,
    )
    .all(limit);
}
export function setSecret(key: string, value: string, by: string) {
  db.query(
    `INSERT INTO "secrets" ("key", "value", "updated_at", "updated_by") VALUES (?, ?, ?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updated_at" = excluded."updated_at", "updated_by" = excluded."updated_by"`,
  ).run(key, value, new Date().toISOString(), by);
}
export function secretFlags(): Record<string, boolean> {
  return Object.fromEntries(
    db
      .query<{ key: string }>(`SELECT "key" FROM "secrets"`)
      .all()
      .map((r) => [r.key, true]),
  );
}

/* ---------- audit ---------- */
/** The one central function every mutation uses to write an audit entry (append-only table). */
export function audit(
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  summary: string,
  highlight = false,
) {
  const e: AuditEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
    entity,
    entityId,
    summary,
    highlight,
  };
  db.query(upsertSql(auditSpec.main)).run(...toValues(e as unknown as Obj, auditSpec.main));
}
export function auditList(limit: number): AuditEvent[] {
  return loadAll<AuditEvent>(
    auditSpec,
    "",
    [],
    `"at" DESC LIMIT ${Math.max(1, Math.min(5000, Math.floor(limit)))}`,
  );
}

export const ALL_TABLES = AGGREGATES.flatMap((a) => [
  a.main.table,
  ...a.children.map((c) => c.spec.table),
]);
