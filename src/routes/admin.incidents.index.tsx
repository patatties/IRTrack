import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Kanban, List, Save, X } from "lucide-react";
import { PageHeader } from "@/features/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIncidents } from "@/shared/hooks";
import type { IncidentQuery } from "@/data/ports";
import { DOMAINS, LEVELS, PHASES, SOURCES } from "@/domain/types";
import {
  ClassBadge,
  LevelBadge,
  PhaseBadge,
  SeverityBadge,
  SourceBadge,
} from "@/shared/components/badges";
import { countdown, rel } from "@/shared/format";
import { t } from "@/i18n";
import { repos } from "@/data";
import { PermissionGate } from "@/auth/permissions";

const NUM = ["severity", "minSeverity", "days", "page", "weekday", "hour"];
export const Route = createFileRoute("/admin/incidents/")({
  validateSearch: (s: Record<string, unknown>): IncidentQuery => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) {
      if (v === undefined || v === "") continue;
      out[k] = NUM.includes(k) ? Number(v) : k === "open" ? v === true || v === "true" : v;
    }
    return out as IncidentQuery;
  },
  head: () => ({
    meta: [
      { title: "Incidents — IRTrack" },
      { name: "description", content: "Search, filter and export all incidents." },
      { property: "og:title", content: "Incidents — IRTrack" },
      { property: "og:description", content: "Search, filter and export all incidents." },
    ],
  }),
  component: IncidentsPage,
});

const VIEWS_KEY = "irtrack.savedViews";

function IncidentsPage() {
  const q = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/incidents/" });
  const [mode, setMode] = useState<"list" | "board">("list");
  const set = (patch: Partial<IncidentQuery>) =>
    navigate({ search: (p: IncidentQuery) => ({ ...p, page: 1, ...patch }) });
  const { data, isFetching } = useIncidents({
    ...q,
    pageSize: mode === "board" ? 200 : 25,
    ...(mode === "board" ? { open: q.open ?? true } : {}),
  });
  const [views, setViews] = useState<{ name: string; q: IncidentQuery }[]>(() =>
    JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]"),
  );
  const saveView = () => {
    const name = prompt("Name for this view");
    if (!name) return;
    const v = [...views, { name, q }];
    setViews(v);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(v));
  };
  const exportCsv = async () => {
    const all = await repos().incidents.list({ ...q, page: 1, pageSize: 100000 });
    const rows = [
      [
        "ref",
        "title",
        "domain",
        "phase",
        "severity",
        "level",
        "source",
        "sourceId",
        "owner",
        "createdAt",
      ],
      ...all.items.map((i) => [
        i.ref,
        i.title,
        i.domain,
        i.phase,
        i.severity,
        i.level,
        i.source,
        i.sourceId,
        i.ownerId,
        i.createdAt,
      ]),
    ];
    const blob = new Blob(
      [rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "irtrack-incidents.csv";
    a.click();
  };
  const active = Object.entries(q).filter(
    ([k]) => k !== "page" && k !== "search" && k !== "sort" && k !== "dir",
  );
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Incidents"
        description="All incidents from every source. Use filters or open one to work on it."
        actions={
          <>
            <div className="inline-flex rounded-md border">
              <Button
                variant={mode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setMode("list")}
              >
                <List className="size-4" /> List
              </Button>
              <Button
                variant={mode === "board" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setMode("board")}
              >
                <Kanban className="size-4" /> Board
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={saveView}>
              <Save className="size-4" /> Save view
            </Button>
            <PermissionGate action="incident.export">
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="size-4" /> {t("common.exportCsv")}
              </Button>
            </PermissionGate>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search reference, title, source ID…"
          defaultValue={q.search}
          onChange={(e) => set({ search: e.target.value || undefined })}
          className="w-72"
        />
        <F
          value={q.domain}
          onChange={(v) => set({ domain: v as never })}
          label="Domain"
          opts={DOMAINS.map((d) => [d, t(`domain.${d}`)])}
        />
        <F
          value={q.phase}
          onChange={(v) => set({ phase: v as never })}
          label="Phase"
          opts={PHASES.map((d) => [d, t(`phase.${d}`)])}
        />
        <F
          value={q.severity ? String(q.severity) : undefined}
          onChange={(v) => set({ severity: v ? (Number(v) as 1) : undefined })}
          label="Severity"
          opts={[1, 2, 3, 4].map((s) => [String(s), `${s} · ${t(`severity.${s}`)}`])}
        />
        <F
          value={q.level}
          onChange={(v) => set({ level: v as never })}
          label="Level"
          opts={LEVELS.map((d) => [d, t(`level.${d}`)])}
        />
        <F
          value={q.source}
          onChange={(v) => set({ source: v as never })}
          label="Source"
          opts={SOURCES.map((d) => [d, t(`source.${d}`)])}
        />
        <F
          value={q.open === undefined ? undefined : String(q.open)}
          onChange={(v) => set({ open: v === "" ? undefined : v === "true" })}
          label="Status"
          opts={[
            ["true", "Open"],
            ["false", "Closed"],
          ]}
        />
        {views.map((v) => (
          <Button
            key={v.name}
            size="sm"
            variant="secondary"
            onClick={() => navigate({ search: v.q })}
          >
            {v.name}
          </Button>
        ))}
      </div>
      {active.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1 text-xs">
          {active.map(([k, v]) => (
            <button
              key={k}
              onClick={() => set({ [k]: undefined })}
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5"
            >
              {k}: {String(v)} <X className="size-3" />
            </button>
          ))}
          <button onClick={() => navigate({ search: {} })} className="underline">
            Clear all
          </button>
        </div>
      )}
      <p className="mb-2 text-sm text-muted-foreground" role="status">
        {isFetching ? "Loading…" : `${data?.total ?? 0} incidents`}
      </p>

      {mode === "list" ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">
                  <button
                    onClick={() => set({ sort: "ref", dir: q.dir === "asc" ? "desc" : "asc" })}
                  >
                    Reference
                  </button>
                </th>
                <th className="p-3">Title</th>
                <th className="p-3">Source</th>
                <th className="p-3">Domain</th>
                <th className="p-3">
                  <button
                    onClick={() => set({ sort: "severity", dir: q.dir === "asc" ? "desc" : "asc" })}
                  >
                    Severity
                  </button>
                </th>
                <th className="p-3">Phase</th>
                <th className="p-3">Owner</th>
                <th className="p-3">Deadline</th>
                <th className="p-3">
                  <button
                    onClick={() =>
                      set({ sort: "createdAt", dir: q.dir === "asc" ? "desc" : "asc" })
                    }
                  >
                    Created
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const dl = i.deadlines
                  .filter((d) => d.status !== "submitted")
                  .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
                return (
                  <tr key={i.id} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">
                      <Link
                        to="/admin/incidents/$id"
                        params={{ id: i.id }}
                        className="text-primary underline"
                      >
                        {i.ref}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Link
                        to="/admin/incidents/$id"
                        params={{ id: i.id }}
                        className="font-medium hover:underline"
                      >
                        {i.title}
                      </Link>{" "}
                      <ClassBadge c={i.classification} />
                    </td>
                    <td className="p-3">
                      <SourceBadge s={i.source} />
                    </td>
                    <td className="p-3">{t(`domain.${i.domain}`)}</td>
                    <td className="p-3">
                      <SeverityBadge s={i.severity} />
                    </td>
                    <td className="p-3">
                      <PhaseBadge p={i.phase} />
                    </td>
                    <td className="p-3">{i.ownerId}</td>
                    <td className="p-3">
                      {dl ? (
                        <span
                          className={
                            countdown(dl.dueAt).overdue ? "font-semibold text-destructive" : ""
                          }
                        >
                          {countdown(dl.dueAt).text}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{rel(i.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && (
            <p className="p-6 text-center text-muted-foreground">
              No incidents match these filters.
            </p>
          )}
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <Button
              size="sm"
              variant="outline"
              disabled={(q.page ?? 1) <= 1}
              onClick={() =>
                navigate({ search: (p: IncidentQuery) => ({ ...p, page: (p.page ?? 1) - 1 }) })
              }
            >
              Previous
            </Button>
            <span>
              Page {q.page ?? 1} of {Math.max(1, Math.ceil((data?.total ?? 0) / 25))}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={(q.page ?? 1) * 25 >= (data?.total ?? 0)}
              onClick={() =>
                navigate({ search: (p: IncidentQuery) => ({ ...p, page: (p.page ?? 1) + 1 }) })
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
          {PHASES.map((p) => (
            <div key={p} className="min-w-56 rounded-xl bg-muted/50 p-2">
              <p className="p-2 text-sm font-semibold">
                {t(`phase.${p}`)}{" "}
                <span className="text-muted-foreground">
                  ({items.filter((i) => i.phase === p).length})
                </span>
              </p>
              <div className="space-y-2">
                {items
                  .filter((i) => i.phase === p)
                  .slice(0, 30)
                  .map((i) => (
                    <Link
                      key={i.id}
                      to="/admin/incidents/$id"
                      params={{ id: i.id }}
                      className="block rounded-lg border bg-card p-3 text-sm shadow-card hover:border-primary/50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-muted-foreground">{i.ref}</span>
                        <SourceBadge s={i.source} />
                      </div>
                      <p className="mt-1 font-medium">{i.title}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <SeverityBadge s={i.severity} />
                        {i.level !== "standard" && <LevelBadge l={i.level} />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{i.ownerId}</p>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function F({
  value,
  onChange,
  label,
  opts,
}: {
  value?: string;
  onChange: (v: string) => void;
  label: string;
  opts: string[][];
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border bg-card px-2 py-2 text-sm"
    >
      <option value="">{label}: all</option>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
