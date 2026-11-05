import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Info } from "lucide-react";
import { PortalShell } from "@/features/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useProcesses, useSituation, useAction } from "@/shared/hooks";
import { publishedVersion, suggest } from "@/domain/rules";
import { LEVELS, type Incident, type LevelId, type Severity } from "@/domain/types";
import { repos } from "@/data";
import { t } from "@/i18n";
import { SeverityBadge, LevelBadge } from "@/shared/components/badges";

export const Route = createFileRoute("/report")({
  validateSearch: (s: Record<string, unknown>): { situation?: string; what?: string } => ({
    situation: typeof s.situation === "string" ? s.situation : undefined,
    what: typeof s.what === "string" ? s.what : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Report an incident — IRTrack" },
      {
        name: "description",
        content:
          "Report an incident in five short steps. We suggest the right process and tell you what happens next.",
      },
      { property: "og:title", content: "Report an incident — IRTrack" },
      { property: "og:description", content: "Report an incident in five short steps." },
    ],
  }),
  component: ReportPage,
});

const nowLocal = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const Schema = z.object({
  what: z.string().min(5, "Please describe what happened in a few words."),
  discovered: z.string().min(1, "When did you discover it?"),
  started: z.string(),
  affected: z.enum(["me", "team", "many", "public"]),
  location: z.string(),
  danger: z.boolean(),
  personalData: z.boolean(),
});
type Form = z.infer<typeof Schema>;

function ReportPage() {
  const { situation, what } = Route.useSearch();
  const { data: sit } = useSituation(situation ?? "__none");
  const sc = sit ? publishedVersion(sit)?.content : undefined;
  const { data: processes = [] } = useProcesses();
  const [step, setStep] = useState(0);
  const [override, setOverride] = useState<{
    processId?: string;
    severity?: Severity;
    level?: LevelId;
  }>({});
  const [done, setDone] = useState<Incident | null>(null);
  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      what: what ?? "",
      discovered: nowLocal(),
      started: "",
      affected: "me",
      location: "",
      danger: false,
      personalData: situation === "misdirected-data",
    },
    values:
      sc && !what
        ? {
            what: sc.title,
            discovered: nowLocal(),
            started: "",
            affected: "me",
            location: "",
            danger: false,
            personalData: situation === "misdirected-data",
          }
        : undefined,
    resetOptions: { keepDirtyValues: true },
  });
  const v = form.watch();
  const sug = useMemo(
    () =>
      suggest(
        { what: v.what, danger: v.danger, personalData: v.personalData, affected: v.affected },
        sc?.processId,
      ),
    [v.what, v.danger, v.personalData, v.affected, sc?.processId],
  );
  // Suggestions use template process IDs; fall back to an existing process when that one was not added.
  const suggestedProcess = processes.some((p) => p.id === sug.processId)
    ? sug.processId
    : (processes[0]?.id ?? sug.processId);
  const final = {
    processId: override.processId ?? suggestedProcess,
    severity: override.severity ?? sug.severity,
    level: override.level ?? sug.level,
  };
  const overridden = !!(override.processId || override.severity || override.level);
  const submit = useAction(async () => {
    const discovered = new Date(v.discovered).toISOString();
    return repos().incidents.create({
      title: v.what.slice(0, 90),
      description: v.what,
      processId: final.processId,
      severity: final.severity,
      level: final.level,
      startedAt: v.started ? new Date(v.started).toISOString() : discovered,
      detectedAt: discovered,
      awareAt: new Date().toISOString(),
      personalData: v.personalData,
      location: v.location,
      suggestion: { ...sug, overridden },
    });
  });

  const fields: (keyof Form)[][] = [
    ["what"],
    ["discovered", "started"],
    ["affected", "location"],
    ["danger", "personalData"],
    [],
  ];
  const next = async () => {
    if (await form.trigger(fields[step])) setStep(step + 1);
  };
  const steps = [
    "What happened?",
    "When did you discover it?",
    "Who or what is affected?",
    "Is there immediate danger, or are personal data involved?",
    "Review and submit",
  ];

  if (done)
    return (
      <PortalShell>
        <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-card">
          <CheckCircle2 className="mx-auto size-12 text-primary" />
          <h1 className="mt-3 text-3xl font-semibold">Thank you — your report is in</h1>
          <p className="mt-4 text-sm text-muted-foreground">Your reference number</p>
          <p className="font-mono text-3xl font-semibold">{done.ref}</p>
          <div className="mt-6 space-y-2 text-left">
            <p className="font-semibold">What happens next</p>
            <p>{done.nextStep}</p>
            <p>
              {done.severity >= 3
                ? "Because this looks serious, a specialist will contact you within 1 hour."
                : "You will hear from us within one working day."}
            </p>
            <p className="font-semibold">Contact</p>
            <p>
              {done.domain === "hr"
                ? "Confidential Advisor"
                : done.domain === "security"
                  ? "Security Operations Centre"
                  : "Service Desk"}{" "}
              · see Contacts for phone numbers
            </p>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link to="/track" search={{ ref: done.ref }}>
                Track this report
              </Link>
            </Button>
            <Button asChild>
              <Link to="/">Back to help</Link>
            </Button>
          </div>
        </div>
      </PortalShell>
    );

  return (
    <PortalShell>
      <div className="mx-auto max-w-xl">
        <p className="text-sm text-muted-foreground">
          {t("portal.report")} · step {step + 1} of 5
        </p>
        <Progress value={((step + 1) / 5) * 100} className="mt-2" />
        {sc && (
          <p className="mt-3 rounded-md bg-primary-soft px-3 py-2 text-sm">
            Situation: <strong>{sc.title}</strong>
          </p>
        )}
        <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <h1 className="text-3xl font-semibold">{steps[step]}</h1>
          {step === 0 && (
            <div>
              <label htmlFor="what" className="sr-only">
                What happened
              </label>
              <Textarea
                id="what"
                rows={5}
                className="text-lg"
                placeholder="Describe it in your own words"
                {...form.register("what")}
              />
              {form.formState.errors.what && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  {form.formState.errors.what.message}
                </p>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <label className="block">
                <span className="font-medium">I discovered it at</span>
                <Input
                  type="datetime-local"
                  className="mt-1 h-12"
                  {...form.register("discovered")}
                />
              </label>
              <label className="block">
                <span className="font-medium">
                  It probably started at <span className="text-muted-foreground">(optional)</span>
                </span>
                <Input type="datetime-local" className="mt-1 h-12" {...form.register("started")} />
              </label>
              <p className="flex gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" /> These times matter: some reporting
                deadlines start when we become aware of an incident.
              </p>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              {(
                [
                  ["me", "Only me"],
                  ["team", "My team or department"],
                  ["many", "Many colleagues or several departments"],
                  ["public", "Citizens or the public"],
                ] as const
              ).map(([k, l]) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                >
                  <input type="radio" value={k} {...form.register("affected")} className="size-5" />{" "}
                  <span className="text-lg">{l}</span>
                </label>
              ))}
              <label className="block">
                <span className="font-medium">
                  Where? <span className="text-muted-foreground">(optional)</span>
                </span>
                <Input
                  className="mt-1 h-12"
                  placeholder="e.g. City Hall, 2nd floor"
                  {...form.register("location")}
                />
              </label>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 has-[:checked]:border-destructive">
                <input type="checkbox" {...form.register("danger")} className="size-5" />{" "}
                <span className="text-lg">Someone is in immediate danger or injured</span>
              </label>
              {v.danger && (
                <p
                  className="rounded-md bg-sev-4 p-3 font-semibold text-destructive-foreground"
                  role="alert"
                >
                  Call 112 first if you have not done so.
                </p>
              )}
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 has-[:checked]:border-primary">
                <input type="checkbox" {...form.register("personalData")} className="size-5" />{" "}
                <span className="text-lg">Personal data may be involved</span>
              </label>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Your description</p>
                <p className="mt-1">{v.what}</p>
              </div>
              <div className="rounded-xl border-2 border-primary/40 bg-primary-soft p-4">
                <p className="font-semibold">IRTrack suggests</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border bg-card px-2 py-0.5 text-xs font-medium">
                    {processes.find((p) => p.id === final.processId)?.name}
                  </span>
                  <SeverityBadge s={final.severity} />
                  <LevelBadge l={final.level} />
                </div>
                <p className="mt-3 text-sm font-medium">Why?</p>
                <ul className="list-disc pl-5 text-sm">
                  {sug.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-primary">
                    Change the suggestion
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <select
                      aria-label="Process"
                      className="rounded border bg-card p-2"
                      value={final.processId}
                      onChange={(e) => setOverride({ ...override, processId: e.target.value })}
                    >
                      {processes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Severity"
                      className="rounded border bg-card p-2"
                      value={final.severity}
                      onChange={(e) =>
                        setOverride({ ...override, severity: Number(e.target.value) as Severity })
                      }
                    >
                      {[1, 2, 3, 4].map((s) => (
                        <option key={s} value={s}>
                          {s} · {t(`severity.${s}`)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Response level"
                      className="rounded border bg-card p-2"
                      value={final.level}
                      onChange={(e) =>
                        setOverride({ ...override, level: e.target.value as LevelId })
                      }
                    >
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {t(`level.${l}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {overridden && (
                    <p className="mt-2 text-xs">Your change is recorded with the report.</p>
                  )}
                </details>
              </div>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
            {step < 4 ? (
              <Button type="button" size="lg" onClick={next}>
                Next
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                disabled={submit.isPending}
                onClick={async () => setDone(await submit.mutateAsync(undefined))}
              >
                {submit.isPending ? "Sending…" : "Submit report"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </PortalShell>
  );
}
