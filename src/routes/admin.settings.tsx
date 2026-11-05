import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Download, Upload, PlugZap } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Card } from "@/features/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction, useAudit, useRules, useSettings } from "@/shared/hooks";
import { repos } from "@/data";
import type { DeadlineStage, ReportingRule, Settings } from "@/domain/types";
import { computeDeadlines } from "@/domain/rules";
import { abs, both } from "@/shared/format";
import { currentActor } from "@/auth/actor";
import { Pill } from "@/shared/components/badges";
import { t } from "@/i18n";
import { PermissionGate } from "@/auth/permissions";

import { TemplateButton } from "@/shared/components/TemplatePicker";
export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — IRTrack" },
      {
        name: "description",
        content: "Configure organization, database, deadlines, teams, portal and integrations.",
      },
      { property: "og:title", content: "Settings — IRTrack" },
      { property: "og:description", content: "Configure IRTrack." },
    ],
  }),
  component: SettingsPage,
});

type Field = {
  key: string;
  label: string;
  help: string;
  type?: "text" | "number" | "list" | "select" | "secret";
  options?: string[];
  restart?: boolean;
  min?: number;
};
type Section = {
  id: string;
  label: string;
  store?: keyof Settings;
  fields?: Field[];
  custom?: "rules" | "users" | "system";
};

const SECTIONS: Section[] = [
  {
    id: "organization",
    label: "Organization",
    store: "organization",
    fields: [
      {
        key: "name",
        label: "Organization name",
        help: "Shown in headers, reports and the portal.",
      },
      { key: "brandColor", label: "Brand color", help: "Hex color used for accents in exports." },
      {
        key: "language",
        label: "Language",
        help: "Default interface language.",
        type: "select",
        options: ["en"],
      },
      {
        key: "timezone",
        label: "Time zone",
        help: "All times are shown in this zone.",
        type: "select",
        options: ["Europe/Amsterdam", "Europe/London", "UTC"],
      },
      { key: "dateFormat", label: "Date format", help: "How dates are written." },
      { key: "businessHours", label: "Business hours", help: "Used for SLA calculations." },
      { key: "holidays", label: "Holidays", help: "Calendar of days outside business hours." },
    ],
  },
  {
    id: "database",
    label: "Database and storage",
    store: "database",
    fields: [
      {
        key: "storage",
        label: "Attachment storage",
        help: "Local volume or S3-compatible.",
        type: "select",
        options: ["local", "s3"],
      },
      { key: "s3Bucket", label: "S3 bucket", help: "Only for S3 storage." },
    ],
  },
  { id: "rules", label: "Reporting deadlines", custom: "rules" },
  { id: "severity", label: "Severity and SLAs", store: "severity", fields: [] },
  {
    id: "teams",
    label: "Response teams",
    store: "teams",
    fields: [
      {
        key: "irtName",
        label: "Local IRT name",
        help: "What your organization calls the Incident Response Team.",
      },
      {
        key: "crtName",
        label: "Local CRT name",
        help: "What your organization calls the Critical Response Team.",
      },
      {
        key: "irtDepartments",
        label: "IRT departments",
        help: "Departments that can join the IRT (comma separated).",
        type: "list",
      },
      {
        key: "crtActivators",
        label: "Who may activate the CRT",
        help: "Roles allowed to decide on CRT activation.",
        type: "list",
      },
      {
        key: "csirtAlias",
        label: "Informational alias for IRT (security)",
        help: "Shown as info text only, e.g. CSIRT.",
      },
      {
        key: "certAlias",
        label: "Informational alias for CRT (security)",
        help: "Shown as info text only, e.g. CERT.",
      },
    ],
  },
  {
    id: "portal",
    label: "User Portal",
    store: "portal",
    fields: [
      { key: "title", label: "Portal title", help: "Shown under the IRTrack logo." },
      { key: "welcome", label: "Welcome text", help: "Above the main question." },
      {
        key: "emergencyMessage",
        label: "Emergency message",
        help: "Always visible at the top of the portal.",
      },
      {
        key: "emergencyNumber",
        label: "Emergency number",
        help: "Number to call for danger to life.",
      },
      {
        key: "contactVerificationDays",
        label: "Contact verification period (days)",
        help: "Contacts older than this are flagged.",
        type: "number",
        min: 1,
      },
      {
        key: "reviewReminderDays",
        label: "Guidance review reminder (days)",
        help: "Warn this many days before a review date.",
        type: "number",
        min: 1,
      },
      {
        key: "featured",
        label: "Featured situations (IDs)",
        help: "Shown first on the portal home.",
        type: "list",
      },
    ],
  },
  { id: "users", label: "Users and access", custom: "users" },
  {
    id: "notifications",
    label: "Notifications",
    store: "notifications",
    fields: [
      { key: "smtpHost", label: "SMTP host", help: "Mail server for email notifications." },
      {
        key: "smtpPassword",
        label: "SMTP password",
        help: "Never shown after saving.",
        type: "secret",
      },
      {
        key: "teamsWebhook",
        label: "Microsoft Teams webhook",
        help: "Channel for incident alerts.",
      },
      { key: "slackChannel", label: "Slack channel", help: "Channel for incident alerts." },
      {
        key: "reminderHours",
        label: "Deadline reminder (hours before)",
        help: "When reminders are sent.",
        type: "number",
        min: 1,
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    fields: [
      {
        key: "topdeskApiKey",
        label: "TOPdesk API key",
        help: "Used to sync incidents.",
        type: "secret",
      },
      {
        key: "servicenowApiKey",
        label: "ServiceNow API key",
        help: "Used to sync incidents.",
        type: "secret",
      },
      {
        key: "webhookSecret",
        label: "Webhook signing secret",
        help: "Verifies incoming webhooks.",
        type: "secret",
      },
    ],
  },
  {
    id: "privacy",
    label: "Data and privacy",
    store: "privacy",
    fields: [
      {
        key: "hrDefault",
        label: "Default classification for HR incidents",
        help: "HR and integrity incidents are confidential by default.",
        type: "select",
        options: ["confidential", "strict"],
      },
      {
        key: "retentionMonths",
        label: "Retention period (months)",
        help: "After this, closed incidents are deleted.",
        type: "number",
        min: 1,
      },
      {
        key: "anonymizeAfterMonths",
        label: "Anonymize after (months)",
        help: "Personal names are removed from closed incidents.",
        type: "number",
        min: 1,
      },
    ],
  },
  {
    id: "masterData",
    label: "Master data",
    store: "masterData",
    fields: [
      { key: "locations", label: "Locations", help: "Comma separated.", type: "list" },
      { key: "services", label: "Services", help: "Comma separated.", type: "list" },
      {
        key: "businessUnits",
        label: "Business units",
        help: "Comma separated. Used as dashboard filter.",
        type: "list",
      },
      { key: "departments", label: "Departments", help: "Comma separated.", type: "list" },
      { key: "suppliers", label: "Suppliers", help: "Comma separated.", type: "list" },
    ],
  },
  { id: "system", label: "System", custom: "system" },
];

function SettingsPage() {
  const [sec, setSec] = useState("organization");
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      SECTIONS.filter(
        (s) =>
          !q ||
          s.label.toLowerCase().includes(q.toLowerCase()) ||
          s.fields?.some((f) => `${f.label} ${f.help}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [q],
  );
  const s = SECTIONS.find((x) => x.id === sec)!;
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Every setting has a short explanation. Changes are logged in the audit trail."
      />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Settings sections">
          <label className="mb-2 flex items-center gap-2 rounded-md border bg-card px-2">
            <Search className="size-4 text-muted-foreground" />
            <span className="sr-only">Search settings</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search settings"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </label>
          <ul className="space-y-0.5">
            {filtered.map((x, i) => (
              <li key={x.id}>
                <button
                  onClick={() => setSec(x.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${sec === x.id ? "bg-muted font-semibold" : ""}`}
                >
                  {SECTIONS.indexOf(x) + 1}. {x.label}
                  {i < 0 ? "" : ""}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          {s.custom === "rules" ? (
            <RulesSection />
          ) : s.custom === "users" ? (
            <UsersSection />
          ) : s.custom === "system" ? (
            <SystemSection />
          ) : s.id === "severity" ? (
            <SeveritySection />
          ) : (
            <FieldSection key={s.id} s={s} />
          )}
        </div>
      </div>
    </div>
  );
}

function FieldSection({ s }: { s: Section }) {
  const { data: settings } = useSettings();
  const { data: info } = useSystemInfo();
  const initial = s.store && settings ? (settings[s.store] as Record<string, unknown>) : {};
  const [v, setV] = useState<Record<string, unknown>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  useEffect(() => {
    if (settings) setV(structuredClone(initial));
  }, [settings, s.id]);
  const dirty =
    JSON.stringify(v) !== JSON.stringify(initial) || Object.values(secrets).some(Boolean);
  useBlocker({
    shouldBlockFn: () => dirty && !confirm(t("common.unsaved")),
    enableBeforeUnload: () => dirty,
  });
  const save = useAction(async () => {
    for (const [k, val] of Object.entries(secrets))
      if (val) await repos().settings.setSecret(k, val);
    if (s.store) await repos().settings.save(s.store, v as never);
  });
  if (!settings) return <p role="status">Loading…</p>;
  const submit = async () => {
    const errs: Record<string, string> = {};
    s.fields?.forEach((f) => {
      if (
        f.type === "number" &&
        (Number(v[f.key]) < (f.min ?? 0) || Number.isNaN(Number(v[f.key])))
      )
        errs[f.key] = `Enter a number of at least ${f.min ?? 0}.`;
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await save.mutateAsync(undefined);
    setSecrets({});
    toast.success(
      s.fields?.some(
        (f) => f.restart && JSON.stringify(v[f.key]) !== JSON.stringify(initial[f.key]),
      )
        ? "Saved. A restart is required for some changes."
        : "Saved",
    );
  };
  return (
    <Card
      title={s.label}
      actions={
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={!dirty}
            onClick={() => {
              setV(structuredClone(initial));
              setSecrets({});
            }}
          >
            {t("common.cancel")}
          </Button>
          <PermissionGate action="settings.edit">
            <Button disabled={!dirty || save.isPending} onClick={submit}>
              {t("common.save")}
            </Button>
          </PermissionGate>
        </div>
      }
    >
      {s.id === "database" && (
        <p className="mb-4 rounded-md bg-accent p-3 text-sm">
          IRTrack stores its data in a SQLite file inside the container. The location is set by the
          deployment (<code>IRTRACK_DB</code>, default <code>/data/irtrack.db</code> on the{" "}
          <code>/data</code> volume). Back up that volume to keep your data.
        </p>
      )}
      <div className="space-y-5">
        {s.fields?.map((f) => {
          const val = v[f.key];
          return (
            <div key={f.key} className="grid gap-1 md:grid-cols-[1fr_1.2fr] md:gap-6">
              <div>
                <label htmlFor={f.key} className="font-medium">
                  {f.label}
                </label>
                <p className="text-sm text-muted-foreground">{f.help}</p>
                <div className="mt-1 flex gap-1">
                  {f.restart && <Pill tone="warn">{t("common.restartRequired")}</Pill>}
                </div>
              </div>
              <div>
                {f.type === "secret" ? (
                  <div className="space-y-1">
                    <Pill tone={settings.secrets[f.key] ? "primary" : "neutral"}>
                      {settings.secrets[f.key] ? t("common.configured") : t("common.notConfigured")}
                    </Pill>
                    <Input
                      id={f.key}
                      type="password"
                      autoComplete="new-password"
                      value={secrets[f.key] ?? ""}
                      onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
                      placeholder="Enter a new value to replace"
                    />
                  </div>
                ) : f.type === "select" ? (
                  <select
                    id={f.key}
                    value={String(val ?? "")}
                    onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                    className="w-full rounded-md border bg-card p-2"
                  >
                    {f.options!.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === "list" ? (
                  <Input
                    id={f.key}
                    value={((val as string[]) ?? []).join(", ")}
                    onChange={(e) =>
                      setV({ ...v, [f.key]: e.target.value.split(",").map((x) => x.trim()) })
                    }
                  />
                ) : (
                  <Input
                    id={f.key}
                    type={f.type === "number" ? "number" : "text"}
                    value={String(val ?? "")}
                    onChange={(e) =>
                      setV({
                        ...v,
                        [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                      })
                    }
                  />
                )}
                {errors[f.key] && (
                  <p className="mt-1 text-sm text-destructive" role="alert">
                    {errors[f.key]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {s.id === "database" && (
          <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
            <div className="space-y-1 text-sm">
              <Button
                variant="outline"
                onClick={async () => {
                  setTesting("Testing…");
                  const r = await repos().settings.testConnection();
                  setTesting(`${r.ok ? "✓" : "✕"} ${r.message} · ${r.ms} ms`);
                }}
              >
                <PlugZap className="size-4" /> Test connection
              </Button>
              {testing && <p role="status">{testing}</p>}
            </div>
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="text-muted-foreground">Engine</dt>
              <dd>{info ? `SQLite ${info.sqliteVersion}` : "…"}</dd>
              <dt className="text-muted-foreground">Database file</dt>
              <dd className="break-all font-mono text-xs">{info?.dbPath ?? "…"}</dd>
              <dt className="text-muted-foreground">Size</dt>
              <dd>{info ? `${(info.dbSizeBytes / 1024 / 1024).toFixed(2)} MB` : "…"}</dd>
              <dt className="text-muted-foreground">Schema version</dt>
              <dd>{info?.schemaVersion ?? "…"}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{info?.createdAt ? abs(info.createdAt) : "…"}</dd>
            </dl>
          </div>
        )}
        <History section={s.store ?? s.id} />
      </div>
    </Card>
  );
}

function History({ section }: { section: string }) {
  const { data } = useSettings();
  const h = data?.history.filter((x) => x.section === section) ?? [];
  return (
    <div className="border-t pt-3 text-sm">
      <p className="font-medium">Change history</p>
      {h.length === 0 ? (
        <p className="text-muted-foreground">No changes yet.</p>
      ) : (
        <ul>
          {h.slice(0, 5).map((x, i) => (
            <li key={i} className="text-muted-foreground">
              {both(x.at)} · {x.by} · {x.summary}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeveritySection() {
  const { data } = useSettings();
  const [v, setV] = useState<Record<string, number>>({});
  useEffect(() => {
    if (data) setV({ ...data.severity.slaHours });
  }, [data]);
  const save = useAction(() => repos().settings.save("severity", { slaHours: v }));
  if (!data) return null;
  const impact = ["One person", "A team", "Many people", "Whole organization"];
  return (
    <Card
      title="Severity and SLAs"
      actions={
        <Button
          onClick={async () => {
            await save.mutateAsync(undefined);
            toast.success("Saved");
          }}
        >
          Save
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Impact × urgency gives a severity. Each severity has an SLA target for resolution.
      </p>
      <table className="mb-4 text-sm">
        <thead>
          <tr>
            <th className="p-1 text-left">Impact \ Urgency</th>
            {["Low", "Medium", "High"].map((u) => (
              <th key={u} className="p-1">
                {u}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {impact.map((im, r) => (
            <tr key={im}>
              <td className="p-1">{im}</td>
              {[0, 1, 2].map((c) => {
                const s = Math.min(4, Math.max(1, Math.round((r + c) / 1.5) + 1));
                return (
                  <td key={c} className="p-1 text-center font-mono">
                    {s} · {t(`severity.${s}`)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-2 md:grid-cols-4">
        {[1, 2, 3, 4].map((s) => (
          <label key={s} className="text-sm">
            {s} · {t(`severity.${s}`)} — SLA hours
            <Input
              type="number"
              value={v[String(s)] ?? 0}
              onChange={(e) => setV({ ...v, [String(s)]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="mt-3">
        <History section="severity" />
      </div>
    </Card>
  );
}

function RulesSection() {
  const { data: rules = [] } = useRules();
  const [sel, setSel] = useState<ReportingRule | null>(null);
  const save = useAction((r: ReportingRule) => repos().rules.save(r));
  const example = {
    startedAt: new Date(Date.now() - 6 * 36e5).toISOString(),
    detectedAt: new Date(Date.now() - 4 * 36e5).toISOString(),
    awareAt: new Date(Date.now() - 3 * 36e5).toISOString(),
  };
  const setStage = (i: number, p: Partial<DeadlineStage>) =>
    sel && setSel({ ...sel, stages: sel.stages.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  return (
    <div className="space-y-4">
      <p className="rounded-lg border-l-4 border-warning bg-accent p-3 text-sm">
        {t("admin.legal")} Changes apply to new incidents. Active incidents keep their stored
        deadline snapshot until someone reapplies the rule on the incident.
      </p>
      <Card
        title="Reporting rules"
        actions={
          <div className="flex gap-2">
            <TemplateButton kind="rules" size="sm" />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSel({
                  id: `rr-${crypto.randomUUID().slice(0, 6)}`,
                  version: 0,
                  name: "New rule",
                  legalBasis: "",
                  regulator: "",
                  jurisdiction: "",
                  processIds: [],
                  trigger: "",
                  anchor: "awareAt",
                  stages: [{ label: "Notification", amount: 24, unit: "hours", from: "anchor" }],
                  reminders: "",
                  ownerRole: "r-lead",
                  effectiveFrom: new Date().toISOString(),
                  active: true,
                  history: [],
                  createdAt: "",
                  createdBy: "",
                  updatedAt: "",
                  updatedBy: "",
                })
              }
            >
              + New rule
            </Button>
          </div>
        }
      >
        <ul className="divide-y">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">
                  {r.name} <span className="text-muted-foreground">v{r.version}</span>{" "}
                  {!r.active && <Pill>inactive</Pill>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.stages.map((s) => `${s.label}: ${s.amount} ${s.unit}`).join(" → ")}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSel(structuredClone(r))}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      {sel && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`Edit ${sel.name}`}>
            <div className="space-y-2 text-sm">
              {(
                ["name", "legalBasis", "regulator", "jurisdiction", "trigger", "reminders"] as const
              ).map((k) => (
                <label key={k} className="block capitalize">
                  {k.replace(/([A-Z])/g, " $1")}
                  <Input value={sel[k]} onChange={(e) => setSel({ ...sel, [k]: e.target.value })} />
                </label>
              ))}
              <label className="block">
                Start moment
                <select
                  className="mt-1 w-full rounded-md border bg-card p-2"
                  value={sel.anchor}
                  onChange={(e) => setSel({ ...sel, anchor: e.target.value as "awareAt" })}
                >
                  <option value="startedAt">Started at</option>
                  <option value="detectedAt">Detected at</option>
                  <option value="awareAt">Became aware at</option>
                </select>
              </label>
              <label className="block">
                Effective date
                <Input
                  type="date"
                  value={sel.effectiveFrom.slice(0, 10)}
                  onChange={(e) =>
                    setSel({ ...sel, effectiveFrom: new Date(e.target.value).toISOString() })
                  }
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sel.active}
                  onChange={(e) => setSel({ ...sel, active: e.target.checked })}
                />{" "}
                Active
              </label>
              <p className="font-semibold">Deadline stages</p>
              {sel.stages.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_100px_110px] gap-1">
                  <Input
                    value={s.label}
                    onChange={(e) => setStage(i, { label: e.target.value })}
                    aria-label="Stage label"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={s.amount}
                    onChange={(e) => setStage(i, { amount: Number(e.target.value) })}
                    aria-label="Amount"
                  />
                  <select
                    className="rounded-md border bg-card"
                    value={s.unit}
                    onChange={(e) => setStage(i, { unit: e.target.value as "hours" })}
                    aria-label="Unit"
                  >
                    {["minutes", "hours", "days", "months"].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-md border bg-card"
                    value={s.from}
                    onChange={(e) => setStage(i, { from: e.target.value as "anchor" })}
                    aria-label="From"
                  >
                    <option value="anchor">from start</option>
                    <option value="previous">after previous</option>
                  </select>
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSel({
                    ...sel,
                    stages: [
                      ...sel.stages,
                      { label: "Next stage", amount: 1, unit: "days", from: "previous" },
                    ],
                  })
                }
              >
                + Add stage
              </Button>
              <div className="flex gap-2 pt-2">
                <Button variant="ghost" onClick={() => setSel(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={sel.stages.some((s) => s.amount < 1)}
                  onClick={async () => {
                    const n = await save.mutateAsync(sel);
                    setSel(n);
                    toast.success(`Saved v${n.version}. New incidents use this version.`);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </Card>
          <Card
            title="Preview with an example incident"
            takeaway="Started 6 h ago, detected 4 h ago, became aware 3 h ago."
          >
            <ul className="space-y-1 text-sm">
              {computeDeadlines({ ...sel }, example).map((d) => (
                <li key={d.id} className="flex justify-between border-b py-1">
                  <span>{d.stage}</span>
                  <span className="font-mono">{abs(d.dueAt)}</span>
                </li>
              ))}
            </ul>
            {sel.history.length > 0 && (
              <>
                <p className="mt-4 font-semibold">Version history</p>
                <ul className="text-xs text-muted-foreground">
                  {sel.history.map((h) => (
                    <li key={h.version}>
                      v{h.version} · {both(h.at)} ·{" "}
                      {h.stages.map((s) => `${s.amount} ${s.unit}`).join(" → ")}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function UsersSection() {
  return (
    <Card title="Users and access">
      <p className="mb-4 rounded-md border-l-4 border-warning bg-accent p-3 text-sm font-medium">
        Access control not active yet. Everyone can open the Admin Console. Permissions are prepared
        and will be enforced centrally.
      </p>
      <table className="mb-4 w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th>User</th>
            <th>Team</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="py-1">{currentActor().name}</td>
            <td className="py-1">{currentActor().team}</td>
            <td className="py-1">{currentActor().role}</td>
          </tr>
        </tbody>
      </table>
      <p className="mb-2 font-medium">Planned authentication methods</p>
      <div className="space-y-1 text-sm">
        {["OpenID Connect (Microsoft Entra ID)", "SAML 2.0", "Local accounts with MFA"].map((m) => (
          <label key={m} className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" disabled /> {m} <Pill>planned</Pill>
          </label>
        ))}
      </div>
    </Card>
  );
}

const useSystemInfo = () =>
  useQuery({ queryKey: ["system-info"], queryFn: () => repos().system.info() });

function SystemSection() {
  const { data: audit = [] } = useAudit(50);
  const { data: settings } = useSettings();
  const { data: info, isError } = useSystemInfo();
  const qc = useQueryClient();
  const exportCfg = () => {
    const { secrets: _s, history: _h, ...pub } = settings!;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(pub, null, 2)], { type: "application/json" }),
    );
    a.download = "irtrack-config.json";
    a.click();
  };
  return (
    <div className="space-y-4">
      <Card title="System">
        <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd>IRTrack {info?.version ?? "…"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Runtime</dt>
            <dd>{info?.runtime ?? "…"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">API health</dt>
            <dd>{isError ? "✕ Not reachable" : info ? "✓ OK" : "…"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Database</dt>
            <dd>{info ? `✓ SQLite ${info.sqliteVersion}, schema v${info.schemaVersion}` : "…"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Server started</dt>
            <dd>{info ? both(info.startedAt) : "…"}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCfg}>
            <Download className="size-4" /> Export configuration
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <Upload className="size-4" /> Import configuration
            <input
              type="file"
              accept=".json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const cfg = JSON.parse(await f.text());
                for (const k of [
                  "organization",
                  "portal",
                  "teams",
                  "notifications",
                  "privacy",
                  "masterData",
                ] as const)
                  if (cfg[k]) await repos().settings.save(k, cfg[k]);
                await qc.invalidateQueries();
                toast.success("Configuration imported");
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Exports never include passwords, API keys or other secrets.
        </p>
      </Card>
      <Card title="Audit log" takeaway="Every change, with who and when.">
        <ul className="max-h-96 space-y-1 overflow-auto text-sm">
          {audit.map((a) => (
            <li
              key={a.id}
              className={`border-l-2 pl-2 ${a.highlight ? "border-sev-3 font-medium" : "border-border"}`}
            >
              <span className="text-xs text-muted-foreground">
                {both(a.at)} · {a.actor} · {a.action}
              </span>
              <br />
              {a.summary}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
