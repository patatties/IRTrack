import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Sparkles } from "lucide-react";
import { AiSetup } from "@/features/setup/AiSetup";
import { AppLogo } from "@/shared/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/features/admin/ui";
import { TemplatePicker } from "@/shared/components/TemplatePicker";
import {
  useAction,
  useMasterDataExamples,
  useRoles,
  useSettings,
  useSetupStatus,
} from "@/shared/hooks";
import { repos } from "@/data";
import { currentActor } from "@/auth/actor";
import { LEVELS, type ContactInput, type Settings, type TemplateKind } from "@/domain/types";
import { t } from "@/i18n";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Set up — IRTrack" },
      { name: "description", content: "First setup of IRTrack." },
    ],
  }),
  component: SetupPage,
});

type StepId = "organization" | "masterData" | TemplateKind | "review";
const STEPS: StepId[] = [
  "organization",
  "masterData",
  "contacts",
  "roles",
  "rules",
  "processes",
  "guidance",
  "sources",
  "review",
];
const TEMPLATE_STEPS = new Set<StepId>([
  "contacts",
  "roles",
  "rules",
  "processes",
  "guidance",
  "sources",
]);

function SetupPage() {
  const [step, setStep] = useState(-1);
  const [aiMode, setAiMode] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: status } = useSetupStatus();
  const finish = async (skipped: boolean) => {
    if (skipped && !confirm(t("setup.skipConfirm"))) return;
    await repos().setup.complete(skipped);
    await qc.invalidateQueries();
    if (!skipped) toast.success(t("setup.finished"));
    navigate({ to: "/" });
  };
  const [demoLoading, setDemoLoading] = useState(false);
  const loadDemo = async () => {
    if (!confirm(t("setup.demoConfirm"))) return;
    setDemoLoading(true);
    try {
      const r = await repos().setup.loadDemo();
      await qc.invalidateQueries();
      toast.success(t("setup.demoLoaded", { n: r.incidents }));
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDemoLoading(false);
    }
  };
  const id = STEPS[step];
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(-1, s - 1));

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2">
          <AppLogo className="size-9" />
          <h1 className="text-2xl font-semibold">{t("setup.title")}</h1>
        </div>

        {aiMode ? (
          <AiSetup onCancel={() => setAiMode(false)} onDone={() => navigate({ to: "/" })} />
        ) : step < 0 ? (
          <div className="space-y-4">
            <p className="max-w-2xl">{t("setup.intro")}</p>
            <h2 className="text-lg font-semibold">{t("setup.choose")}</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Card title={t("setup.ownTitle")} takeaway={t("setup.ownHelp")}>
                <ol className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  {STEPS.map((s, i) => (
                    <li key={s}>
                      {i + 1}. {t(`setup.steps.${s}.title`)}
                    </li>
                  ))}
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => setStep(0)}>{t("setup.start")}</Button>
                  <Button variant="ghost" onClick={() => finish(true)}>
                    {t("setup.skip")}
                  </Button>
                </div>
              </Card>
              <Card title={t("setup.ai.title")} takeaway={t("setup.ai.help")}>
                <Button onClick={() => setAiMode(true)}>
                  <Sparkles className="size-4" /> {t("setup.ai.start")}
                </Button>
              </Card>
              <Card title={t("setup.demoTitle")} takeaway={t("setup.demoHelp")}>
                <Button variant="outline" disabled={demoLoading} onClick={loadDemo}>
                  {demoLoading ? t("setup.demoLoading") : t("setup.demoButton")}
                </Button>
              </Card>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <nav aria-label={t("setup.title")}>
              <ol className="space-y-1">
                {STEPS.map((s, i) => (
                  <li key={s}>
                    <button
                      onClick={() => setStep(i)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${i === step ? "bg-muted font-semibold" : ""}`}
                    >
                      {i < step ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                      {t(`setup.steps.${s}.title`)}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <Card title={t(`setup.steps.${id}.title`)} takeaway={t(`setup.steps.${id}.help`)}>
              <p className="mb-4 text-xs text-muted-foreground">
                {t("setup.stepOf", { n: step + 1, total: STEPS.length })}
                {TEMPLATE_STEPS.has(id) && status && (
                  <> · {t("setup.current", { n: status.counts[id as TemplateKind] })}</>
                )}
              </p>
              {id === "organization" && <OrganizationStep onDone={next} onBack={back} />}
              {id === "masterData" && <MasterDataStep onDone={next} onBack={back} />}
              {TEMPLATE_STEPS.has(id) && (
                <div className="space-y-6">
                  <TemplatePicker key={id} kind={id as TemplateKind} />
                  {id === "contacts" && <OwnContact />}
                  {id === "roles" && <OwnRole />}
                  <StepNav onBack={back} onNext={next} />
                </div>
              )}
              {id === "review" && (
                <div className="space-y-4">
                  <table className="w-full text-sm">
                    <tbody>
                      {[...TEMPLATE_STEPS].map((k) => (
                        <tr key={k} className="border-t">
                          <td className="py-2">{t(`setup.steps.${k}.title`)}</td>
                          <td className="text-right font-mono">
                            {status?.counts[k as TemplateKind] ?? "…"}
                          </td>
                          <td className="pl-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setStep(STEPS.indexOf(k))}
                            >
                              {t("common.edit")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={back}>
                      {t("setup.back")}
                    </Button>
                    <Button onClick={() => finish(false)}>{t("setup.finish")}</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex justify-between border-t pt-4">
      <Button type="button" variant="ghost" onClick={onBack}>
        {t("setup.back")}
      </Button>
      <Button type="button" onClick={onNext}>
        {nextLabel ?? t("setup.next")}
      </Button>
    </div>
  );
}

function OrganizationStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { data: s } = useSettings();
  const [org, setOrg] = useState<Settings["organization"] | null>(null);
  const [portal, setPortal] = useState<Settings["portal"] | null>(null);
  useEffect(() => {
    if (s && !org) {
      setOrg(s.organization);
      setPortal(s.portal);
    }
  }, [s, org]);
  const save = useAction(async () => {
    await repos().settings.save("organization", org!);
    await repos().settings.save("portal", portal!);
  });
  if (!org || !portal) return <p role="status">{t("common.loading")}</p>;
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        await save.mutateAsync(undefined);
        onDone();
      }}
    >
      <label className="block">
        {t("setup.fields.orgName")}
        <Input
          required
          value={org.name}
          onChange={(e) => setOrg({ ...org, name: e.target.value })}
        />
      </label>
      <label className="block">
        {t("setup.fields.timezone")}
        <select
          className="mt-1 w-full rounded-md border bg-card p-2"
          value={org.timezone}
          onChange={(e) => setOrg({ ...org, timezone: e.target.value })}
        >
          {["Europe/Amsterdam", "Europe/Brussels", "Europe/London", "UTC"].map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      <label className="block">
        {t("setup.fields.portalTitle")}
        <Input
          value={portal.title}
          onChange={(e) => setPortal({ ...portal, title: e.target.value })}
        />
      </label>
      <label className="block">
        {t("setup.fields.emergencyNumber")}
        <Input
          value={portal.emergencyNumber}
          onChange={(e) => setPortal({ ...portal, emergencyNumber: e.target.value })}
        />
      </label>
      <label className="block">
        {t("setup.fields.emergencyMessage")}
        <Input
          value={portal.emergencyMessage}
          onChange={(e) => setPortal({ ...portal, emergencyMessage: e.target.value })}
        />
      </label>
      <div className="flex justify-between border-t pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          {t("setup.back")}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t("setup.next")}
        </Button>
      </div>
    </form>
  );
}

const MD_KEYS: { key: keyof Settings["masterData"]; label: string }[] = [
  { key: "locations", label: "Locations" },
  { key: "services", label: "Services" },
  { key: "businessUnits", label: "Business units" },
  { key: "departments", label: "Departments" },
  { key: "suppliers", label: "Suppliers" },
];

function MasterDataStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { data: s } = useSettings();
  const { data: examples } = useMasterDataExamples();
  const [md, setMd] = useState<Settings["masterData"] | null>(null);
  useEffect(() => {
    if (s && !md) setMd(s.masterData);
  }, [s, md]);
  const save = useAction((v: Settings["masterData"]) => repos().settings.save("masterData", v));
  if (!md) return <p role="status">{t("common.loading")}</p>;
  const clean = (v: string[]) => [...new Set(v.map((x) => x.trim()).filter(Boolean))];
  const set = (k: keyof Settings["masterData"], v: string[]) => setMd({ ...md, [k]: clean(v) });
  return (
    <div className="space-y-5 text-sm">
      {MD_KEYS.map(({ key, label }) => (
        <div key={key}>
          <label className="block font-medium" htmlFor={`md-${key}`}>
            {label}
          </label>
          <Input
            id={`md-${key}`}
            value={md[key].join(", ")}
            onChange={(e) =>
              setMd({ ...md, [key]: e.target.value.split(",").map((x) => x.trimStart()) })
            }
            onBlur={() => set(key, md[key])}
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {(examples?.[key] ?? [])
              .filter((x) => !md[key].includes(x))
              .map((x) => (
                <button
                  key={x}
                  type="button"
                  className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                  onClick={() => set(key, [...md[key], x])}
                >
                  + {x}
                </button>
              ))}
          </div>
        </div>
      ))}
      <StepNav
        onBack={onBack}
        onNext={async () => {
          const cleaned = Object.fromEntries(
            MD_KEYS.map(({ key }) => [key, clean(md[key])]),
          ) as Settings["masterData"];
          await save.mutateAsync(cleaned);
          onDone();
        }}
      />
    </div>
  );
}

function OwnContact() {
  const empty = { name: "", role: "", phone: "", email: "", emergency: false, roleId: "" };
  const { data: roles = [] } = useRoles();
  const [c, setC] = useState(empty);
  const add = useAction((input: ContactInput) => repos().contacts.save(null, input));
  return (
    <form
      className="space-y-2 rounded-lg border p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        await add.mutateAsync({
          name: c.name,
          role: c.role || "Contact",
          team: "—",
          type: "person",
          organization: "",
          phone: c.phone,
          mobile: "",
          email: c.email,
          availability: "",
          timezone: "Europe/Amsterdam",
          outOfHours: "",
          whenToContact: "",
          backupId: "",
          notes: "",
          emergency: c.emergency,
          roleIds: c.roleId ? [c.roleId] : [],
        });
        toast.success(t("setup.own.added", { name: c.name }));
        setC(empty);
      }}
    >
      <p className="font-medium">{t("setup.own.contact")}</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          required
          minLength={2}
          placeholder={t("setup.own.name")}
          aria-label={t("setup.own.name")}
          value={c.name}
          onChange={(e) => setC({ ...c, name: e.target.value })}
        />
        <Input
          placeholder={t("setup.own.roleField")}
          aria-label={t("setup.own.roleField")}
          value={c.role}
          onChange={(e) => setC({ ...c, role: e.target.value })}
        />
        <Input
          placeholder={t("setup.own.phone")}
          aria-label={t("setup.own.phone")}
          value={c.phone}
          onChange={(e) => setC({ ...c, phone: e.target.value })}
        />
        <Input
          type="email"
          placeholder={t("setup.own.email")}
          aria-label={t("setup.own.email")}
          value={c.email}
          onChange={(e) => setC({ ...c, email: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          className="rounded-md border bg-card p-1"
          aria-label={t("roles.rolesField")}
          value={c.roleId}
          onChange={(e) => setC({ ...c, roleId: e.target.value })}
        >
          <option value="">{t("roles.noRole")}</option>
          {[...roles]
            .sort(
              (a, b) =>
                LEVELS.indexOf(a.level as never) - LEVELS.indexOf(b.level as never) ||
                a.name.localeCompare(b.name),
            )
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={c.emergency}
            onChange={(e) => setC({ ...c, emergency: e.target.checked })}
          />{" "}
          {t("setup.own.emergency")}
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={add.isPending}>
          {t("setup.own.add")}
        </Button>
      </div>
    </form>
  );
}

function OwnRole() {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const add = useAction(() => {
    const at = new Date().toISOString();
    const by = currentActor().name;
    return repos().roles.save({
      id: `r-${crypto.randomUUID().slice(0, 8)}`,
      name,
      summary,
      responsibilities: [],
      skills: [],
      decides: [],
      contactIds: [],
      onEscalation: "",
      createdAt: at,
      createdBy: by,
      updatedAt: at,
      updatedBy: by,
    });
  });
  return (
    <form
      className="space-y-2 rounded-lg border p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        await add.mutateAsync(undefined);
        toast.success(t("setup.own.added", { name }));
        setName("");
        setSummary("");
      }}
    >
      <p className="font-medium">{t("setup.own.role")}</p>
      <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
        <Input
          required
          placeholder={t("setup.own.name")}
          aria-label={t("setup.own.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder={t("setup.own.summary")}
          aria-label={t("setup.own.summary")}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={add.isPending}>
          {t("setup.own.add")}
        </Button>
      </div>
    </form>
  );
}
