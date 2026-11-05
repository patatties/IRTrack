import { useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useDashboard, useProcesses, useSettings } from "@/shared/hooks";
import type { DashboardFilters, IncidentQuery } from "@/data/ports";
import { DOMAINS, LEVELS, SOURCES, type DomainId, type SourceId } from "@/domain/types";
import { t } from "@/i18n";
import { Card } from "./ui";
import { LevelBadge, PhaseBadge, SeverityBadge } from "@/shared/components/badges";
import { countdown, rel, day } from "@/shared/format";
import { cn } from "@/lib/utils";

const DOMAIN_COLOR: Record<DomainId, string> = {
  it: "var(--chart-1)",
  security: "var(--chart-2)",
  privacy: "var(--chart-5)",
  facilities: "var(--chart-3)",
  safety: "var(--chart-6)",
  hr: "var(--chart-7)",
  continuity: "var(--chart-4)",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DashboardView({
  ctx,
  compact,
}: {
  ctx: DashboardFilters["ctx"];
  compact?: boolean;
}) {
  const [f, setF] = useState<Omit<DashboardFilters, "ctx">>({ days: 30 });
  const { data, isLoading } = useDashboard({ ...f, ctx });
  const { data: processes = [] } = useProcesses();
  const { data: settings } = useSettings();
  const LOCATIONS = settings?.masterData.locations ?? [];
  const UNITS = settings?.masterData.businessUnits ?? [];
  const navigate = useNavigate();
  const drill = (q: IncidentQuery) => {
    if (ctx !== "admin") return;
    const base: IncidentQuery = {
      domain: f.domain,
      processId: f.processId,
      source: f.source,
      location: f.location,
      businessUnit: f.businessUnit,
    };
    navigate({ to: "/admin/incidents", search: { ...base, ...q } as never });
  };
  const clickable = ctx === "admin" ? "cursor-pointer" : "";

  if (isLoading || !data)
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );

  const s = data.summary;
  /** Escalation funnel: each stage with how many incidents stopped there (real counts only). */
  const funnel = (() => {
    const values = data.funnel.map((x) => Math.max(x.value, 0));
    const stoppedLabels = [
      "not yet assessed",
      "solved at first line",
      "solved by specialist",
      "solved by IRT",
      "",
    ];
    const rows = data.funnel.map((x, k) => ({
      stage: x.stage,
      link: x.link,
      value: values[k],
      stopped: Math.max(0, values[k] - (values[k + 1] ?? 0)),
      stoppedLabel: stoppedLabels[k],
    }));
    return { rows, all: values[0] ?? 0, crt: values[4] ?? 0 };
  })();
  const maxHeat = Math.max(1, ...data.heatmap.flat());
  const bottleneck = [...data.phaseHours].sort((a, b) => b.hours - a.hours)[0];
  const sevRows = [1, 2, 3, 4].map((sv) => ({
    name: `${sv} · ${t(`severity.${sv}`)}`,
    sv,
    ...Object.fromEntries(
      LEVELS.map((l) => [
        l,
        data.severity.find((x) => x.severity === sv && x.level === l)?.count ?? 0,
      ]),
    ),
  }));

  return (
    <div className="space-y-6">
      <div className={cn("rounded-2xl border bg-hero p-6", compact && "p-4")}>
        <p className="text-sm font-medium text-muted-foreground">Right now</p>
        <p
          className={cn(
            "mt-1 font-display font-semibold leading-tight",
            compact ? "text-3xl" : "text-3xl md:text-4xl",
          )}
        >
          {s.serious} serious incident{s.serious === 1 ? " is" : "s are"} active. {s.deadlinesToday}{" "}
          reporting deadline{s.deadlinesToday === 1 ? " is" : "s are"} due today.
        </p>
        <p className="mt-1 text-muted-foreground">
          {s.open} incidents are open across all domains and sources.
        </p>
        {!compact && (
          <div className="no-print mt-4 flex flex-wrap gap-2 text-sm">
            <Sel
              label="Period"
              value={String(f.days)}
              onChange={(v) => setF({ ...f, days: Number(v) })}
              options={[
                ["7", "Last 7 days"],
                ["30", "Last 30 days"],
                ["90", "Last 90 days"],
                ["365", "Last 12 months"],
              ]}
            />
            <Sel
              label="Domain"
              value={f.domain ?? ""}
              onChange={(v) => setF({ ...f, domain: (v || undefined) as DomainId })}
              options={[
                ["", "All domains"],
                ...DOMAINS.map((d) => [d, t(`domain.${d}`)] as [string, string]),
              ]}
            />
            <Sel
              label="Process"
              value={f.processId ?? ""}
              onChange={(v) => setF({ ...f, processId: v || undefined })}
              options={[
                ["", "All processes"],
                ...processes.map((p) => [p.id, p.name] as [string, string]),
              ]}
            />
            <Sel
              label="Source"
              value={f.source ?? ""}
              onChange={(v) => setF({ ...f, source: (v || undefined) as SourceId })}
              options={[
                ["", "All sources"],
                ...SOURCES.map((x) => [x, t(`source.${x}`)] as [string, string]),
              ]}
            />
            <Sel
              label="Location"
              value={f.location ?? ""}
              onChange={(v) => setF({ ...f, location: v || undefined })}
              options={[["", "All locations"], ...LOCATIONS.map((x) => [x, x] as [string, string])]}
            />
            <Sel
              label="Business unit"
              value={f.businessUnit ?? ""}
              onChange={(v) => setF({ ...f, businessUnit: v || undefined })}
              options={[
                ["", "All business units"],
                ...UNITS.map((x) => [x, x] as [string, string]),
              ]}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {data.kpis.map((k) => {
          const diff = k.value - k.previous;
          const good = diff === 0 ? null : diff < 0 === (k.better === "down");
          const Icon = diff === 0 ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
          return (
            <button
              key={k.key}
              onClick={() => drill({ ...k.link, days: k.link.days })}
              className={cn(
                "rounded-xl border bg-card p-4 text-left shadow-card transition hover:border-primary/50",
                clickable,
              )}
            >
              <p className="text-sm text-muted-foreground">{t(`admin.kpi.${k.key}`)}</p>
              <p className="mt-1 font-display text-3xl font-semibold">
                {k.value}
                <span className="ml-1 text-base font-normal text-muted-foreground">{k.unit}</span>
              </p>
              <p
                className={cn(
                  "mt-1 inline-flex items-center gap-1 text-xs",
                  good === true && "text-success",
                  good === false && "text-destructive",
                )}
              >
                <Icon className="size-3" /> {diff > 0 ? "+" : ""}
                {diff}
                {k.unit ?? ""} {t("common.previous")} ({k.previous})
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="From report to crisis team"
          takeaway={
            funnel.all === 0
              ? "No reports in this period."
              : `${funnel.all} reports in this period; ${funnel.crt} needed the CRT.`
          }
          className="xl:col-span-2"
        >
          {funnel.all === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.empty")}</p>
          ) : (
            <ol className="space-y-2" aria-label="Escalation funnel">
              {funnel.rows.map((r, k) => (
                <li key={r.stage}>
                  <button
                    type="button"
                    onClick={() => drill(r.link)}
                    className={cn(
                      "grid w-full grid-cols-[120px_1fr_150px] items-center gap-3 rounded-md p-1 text-left text-sm hover:bg-muted/60",
                      clickable,
                    )}
                  >
                    <span className="font-medium">{r.stage}</span>
                    <span className="h-7 rounded-sm bg-muted">
                      <span
                        className="flex h-full items-center rounded-sm px-2 text-xs font-semibold text-primary-foreground"
                        style={{
                          width: `${Math.max(r.value ? 4 : 0, (r.value / funnel.all) * 100)}%`,
                          background:
                            k === funnel.rows.length - 1 ? "var(--sev-4)" : "var(--primary)",
                        }}
                      >
                        {r.value || ""}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.stoppedLabel && r.stopped > 0 ? `${r.stopped} ${r.stoppedLabel}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card
          title="Active serious incidents"
          takeaway="Severity 3 and 4, with their next deadline."
        >
          <ul className="space-y-2">
            {data.serious.map((i) => {
              const dl = i.deadlines
                .filter((d) => d.status !== "submitted")
                .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
              const inner = (
                <>
                  <div className="flex items-center gap-2">
                    <SeverityBadge s={i.severity} />
                    <span className="font-mono text-xs text-muted-foreground">{i.ref}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{i.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <PhaseBadge p={i.phase} /> {i.ownerId && <span>{i.ownerId}</span>}
                    {dl && (
                      <span
                        className={cn(
                          countdown(dl.dueAt).overdue && "font-semibold text-destructive",
                        )}
                      >
                        ⏱ {countdown(dl.dueAt).text}
                      </span>
                    )}
                  </div>
                </>
              );
              return (
                <li key={i.id} className="rounded-lg border p-3 hover:bg-muted/50">
                  {ctx === "admin" ? (
                    <Link to="/admin/incidents/$id" params={{ id: i.id }}>
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="Incident volume by domain"
          takeaway="IT dominates volume; winter months are busier."
          className="xl:col-span-2"
        >
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={data.volume}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="week"
                  tickFormatter={(v) => day(v)}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
                />
                <Legend formatter={(v) => t(`domain.${v}`)} />
                {DOMAINS.map((d) => (
                  <Area
                    key={d}
                    type="linear"
                    dataKey={d}
                    stackId="1"
                    stroke={DOMAIN_COLOR[d]}
                    fill={DOMAIN_COLOR[d]}
                    fillOpacity={0.7}
                    onClick={() => drill({ domain: d, days: f.days })}
                    className={clickable}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card
          title="When incidents are reported"
          takeaway="Peaks on weekday mornings. Weekends are quiet but not empty."
        >
          <div
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: "32px repeat(24, 1fr)" }}
            role="table"
            aria-label="Heatmap by weekday and hour"
          >
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <div key={d} className="contents" role="row">
                <span className="text-[10px] text-muted-foreground">{DAYS[d]}</span>
                {data.heatmap[d].map((v, h) => (
                  <button
                    key={h}
                    title={`${DAYS[d]} ${h}:00 — ${v} incidents`}
                    onClick={() => drill({ weekday: d, hour: h, days: f.days })}
                    className="aspect-square rounded-[2px]"
                    style={{
                      background: `color-mix(in oklab, var(--primary) ${Math.round((v / maxHeat) * 100)}%, var(--muted))`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">00:00 → 23:00</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card
          title="Severity and response level"
          takeaway="Most incidents are low severity at standard level."
        >
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={sevRows} layout="vertical">
                <XAxis type="number" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={80}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip contentStyle={{ background: "var(--card)" }} />
                {LEVELS.map((l, i) => (
                  <Bar
                    key={l}
                    dataKey={l}
                    name={t(`level.${l}`)}
                    stackId="a"
                    fill={`var(--chart-${i + 1})`}
                    onClick={(d: { sv: number }) =>
                      drill({ severity: d.sv as 1, level: l, days: f.days })
                    }
                    className={clickable}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card
          title="Time spent per phase (median hours)"
          takeaway={`Bottleneck: ${t(`phase.${bottleneck.phase}`)} takes longest.`}
        >
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={data.phaseHours.map((p) => ({ ...p, name: t(`phase.${p.phase}`) }))}>
                <XAxis dataKey="name" fontSize={10} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--card)" }} />
                <Bar
                  dataKey="hours"
                  onClick={(d: { phase: string }) =>
                    drill({ phase: d.phase as "assess", days: f.days })
                  }
                  className={clickable}
                >
                  {data.phaseHours.map((p) => (
                    <Cell
                      key={p.phase}
                      fill={p.phase === bottleneck.phase ? "var(--sev-3)" : "var(--primary)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Latest events" takeaway="Live feed from all sources.">
          <ul className="max-h-56 space-y-2 overflow-auto text-sm">
            {data.latest.map((e, i) => (
              <li key={i} className="flex gap-2 border-l-2 border-primary/40 pl-2">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.ref} · {rel(e.at)}
                  </span>
                  <p>{e.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {!compact && (
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["Top services", data.topServices, "service"],
              ["Top locations", data.topLocations, "location"],
              ["Recurring categories", data.topCategories, "category"],
            ] as const
          ).map(([title, rows, key]) => (
            <Card
              key={title}
              title={title}
              takeaway={`${rows[0]?.name ?? "—"} appears most often.`}
            >
              <ul className="space-y-1.5">
                {rows.map((r) => (
                  <li key={r.name}>
                    <button
                      onClick={() => drill({ [key]: r.name, days: f.days })}
                      className="w-full text-left text-sm"
                    >
                      <div className="flex justify-between">
                        <span>{r.name}</span>
                        <span className="font-mono">{r.count}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded bg-muted">
                        <div
                          className="h-full rounded bg-primary"
                          style={{ width: `${(r.count / rows[0].count) * 100}%` }}
                        />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {ctx !== "admin" && (
        <p className="text-xs text-muted-foreground">
          Confidential incidents are shown only as numbers in this view.
        </p>
      )}
      <span className="hidden">
        <LevelBadge l="standard" />
      </span>
    </div>
  );
}

function Sel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-card px-2 py-1.5"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
