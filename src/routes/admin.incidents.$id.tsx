import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Info,
  Paperclip,
  RefreshCw,
  Siren,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useAction, useIncident, useProcesses, useRoles, useSettings } from "@/shared/hooks";
import { repos } from "@/data";
import { PHASES, type Incident, type PhaseId } from "@/domain/types";
import { crtApplies, crtExplanation } from "@/domain/rules";
import {
  ClassBadge,
  LevelBadge,
  PhaseBadge,
  SeverityBadge,
  SourceBadge,
  Pill,
} from "@/shared/components/badges";
import { abs, both, countdown, rel } from "@/shared/format";
import { t } from "@/i18n";
import { Card, Term } from "@/features/admin/ui";
import { PermissionGate } from "@/auth/permissions";
import { currentActor } from "@/auth/actor";
import { PlaybookButton, useCommExamples, useDecisionExamples } from "@/features/admin/Playbook";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/incidents/$id")({
  head: () => ({
    meta: [
      { title: "Incident — IRTrack" },
      {
        name: "description",
        content: "Work on an incident: phase, tasks, decisions, deadlines and communication.",
      },
      { property: "og:title", content: "Incident — IRTrack" },
      { property: "og:description", content: "Work on an incident." },
    ],
  }),
  component: IncidentPage,
});

const PHASE_COND: Record<PhaseId, { entry: string; exit: string }> = {
  report: {
    entry: "A report has been received.",
    exit: "The report is registered and the reporter has a reference.",
  },
  assess: {
    entry: "The report is registered.",
    exit: "Severity, response level and owner are set.",
  },
  respond: {
    entry: "An owner is assigned.",
    exit: "The cause is contained and no further harm is expected.",
  },
  recover: {
    entry: "The incident is contained.",
    exit: "Normal service is restored and confirmed.",
  },
  close: {
    entry: "Service is restored.",
    exit: "Review is done and improvement actions are assigned.",
  },
};

function IncidentPage() {
  const { id } = Route.useParams();
  const { data: i, isLoading } = useIncident(id);
  const { data: processes = [] } = useProcesses();
  const { data: roles = [] } = useRoles();
  const [dialog, setDialog] = useState<null | "irt" | "crt" | "phase" | "standdown">(null);
  const update = useAction(
    (a: { patch: Partial<Incident>; summary: string; highlight?: boolean }) =>
      repos().incidents.update(id, a.patch, a.summary, a.highlight),
  );
  const decisionExamples = useDecisionExamples(i?.domain ?? "it");
  const commExamples = useCommExamples(i?.domain ?? "it");
  if (isLoading) return <p role="status">Loading incident…</p>;
  if (!i)
    return (
      <p>
        Incident not found.{" "}
        <Link to="/admin/incidents" className="underline">
          Back to incidents
        </Link>
      </p>
    );
  const proc = processes.find((p) => p.id === i.processId);
  const dl = i.deadlines
    .filter((d) => d.status !== "submitted")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const pIdx = PHASES.indexOf(i.phase);
  const crtActive = i.activations.find((a) => a.team === "crt" && !a.stoodDownAt);
  const irtActive = i.activations.some((a) => a.team === "irt");
  const isSec = i.domain === "security";

  return (
    <div className="space-y-5">
      <Link to="/admin/incidents" className="text-sm text-primary underline">
        ← Incidents
      </Link>
      {/* Fixed header: always the same place */}
      <header className="sticky top-14 z-20 -mx-6 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-muted-foreground">{i.ref}</span>
          <SourceBadge s={i.source} />
          <ClassBadge c={i.classification} tlp={i.tlp} />
        </div>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{i.title}</h1>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">{t("common.phase")}</p>
            <PhaseBadge p={i.phase} local={proc?.phaseNames[i.phase]} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("common.severity")}</p>
            <SeverityBadge s={i.severity} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("common.level")}</p>
            <LevelBadge l={i.level} local={proc?.levelNames[i.level]} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("common.owner")}</p>
            <p className="font-medium">{i.ownerId || "Unassigned"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("common.deadline")}</p>
            {dl ? (
              <p className={cn("font-medium", countdown(dl.dueAt).overdue && "text-destructive")}>
                {dl.stage}: {countdown(dl.dueAt).text}
              </p>
            ) : (
              <p>None</p>
            )}
          </div>
        </div>
      </header>

      <div className="rounded-xl border-2 border-primary bg-primary-soft p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {t("admin.nextStep")}
        </p>
        <p className="mt-1 text-lg font-medium">{i.nextStep ?? PHASE_COND[i.phase].exit}</p>
        <div className="no-print mt-3 flex flex-wrap gap-2">
          <PermissionGate action="incident.update">
            {i.phase !== "close" && (
              <Button onClick={() => setDialog("phase")}>
                Move to {t(`phase.${PHASES[pIdx + 1]}`)} <ArrowRight className="size-4" />
              </Button>
            )}
          </PermissionGate>
          <PermissionGate action="incident.activate_irt">
            {!irtActive && i.level !== "critical" && (
              <Button variant="outline" onClick={() => setDialog("irt")}>
                <Users className="size-4" /> Activate IRT
              </Button>
            )}
          </PermissionGate>
          <PermissionGate action="incident.activate_crt">
            {!crtActive && (
              <Button variant="outline" onClick={() => setDialog("crt")}>
                <Siren className="size-4" /> Activate CRT…
              </Button>
            )}
          </PermissionGate>
          {crtActive && (
            <Button variant="outline" onClick={() => setDialog("standdown")}>
              Stand down CRT
            </Button>
          )}
        </div>
      </div>

      <ol className="grid grid-cols-5 gap-1" aria-label="Phase progress">
        {PHASES.map((p, k) => (
          <li
            key={p}
            className={cn(
              "rounded-md border p-2 text-xs",
              k < pIdx && "bg-muted",
              k === pIdx && "border-primary bg-card ring-2 ring-primary/30",
            )}
            title={`Entry: ${PHASE_COND[p].entry}\nExit: ${PHASE_COND[p].exit}`}
          >
            <p className="font-semibold">
              {k < pIdx ? "✓ " : ""}
              {proc?.phaseNames[p] ?? t(`phase.${p}`)}
            </p>
            {k === pIdx && (
              <p className="mt-1 hidden text-muted-foreground md:block">
                Done when: {PHASE_COND[p].exit}
              </p>
            )}
          </li>
        ))}
      </ol>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap">
          {[
            "overview",
            "tasks",
            "timeline",
            "decisions",
            "communication",
            "evidence",
            "reporting",
            "review",
          ].map((x) => (
            <TabsTrigger key={x} value={x} className="capitalize">
              {x === "evidence" ? "Evidence & attachments" : x}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card title="Description" className="lg:col-span-2">
            <p>{i.description || "No description."}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Process</dt>
                <dd>
                  {proc?.name} (v{i.processVersion})
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{i.location}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Service</dt>
                <dd>{i.service}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Started at</dt>
                <dd>{abs(i.startedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Detected at</dt>
                <dd>{abs(i.detectedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  <Term k="Became aware">Became aware at</Term>
                </dt>
                <dd>{abs(i.awareAt)}</dd>
              </div>
            </dl>
            {isSec && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="size-3" /> {t("csirt")} {t("cert")}
              </p>
            )}
          </Card>
          <div className="space-y-4">
            {i.source !== "irtrack" && (
              <Card title="Source information">
                <p className="text-sm">
                  Imported from <strong>{t(`source.${i.source}`)}</strong> as{" "}
                  <span className="font-mono">{i.sourceId}</span>
                </p>
                {i.lastSyncAt && (
                  <p className="text-xs text-muted-foreground">Last sync {rel(i.lastSyncAt)}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {i.sourceUrl && (
                    <a
                      href={i.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary underline"
                    >
                      <ExternalLink className="size-3" /> Open in source system
                    </a>
                  )}
                  {i.level === "standard" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        update.mutate({
                          patch: {
                            level: "elevated",
                            processId:
                              i.domain === "security" &&
                              processes.some((p) => p.id === "p-security")
                                ? "p-security"
                                : i.processId,
                          },
                          summary: "Promoted into IRTrack coordination process",
                        })
                      }
                    >
                      Promote to coordination
                    </Button>
                  )}
                </div>
              </Card>
            )}
            <Card title="Activations">
              {i.activations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No team activated.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {i.activations.map((a) => (
                    <li
                      key={a.id}
                      className={cn(
                        "rounded-md border p-2",
                        a.override && "border-sev-3 bg-sev-3/10",
                      )}
                    >
                      <p className="font-semibold">
                        {a.team.toUpperCase()} {a.stoodDownAt ? "(stood down)" : "active"}{" "}
                        {a.override && <Pill tone="warn">Override</Pill>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {both(a.at)} · {a.by}
                      </p>
                      <p>{a.rationale}</p>
                      {a.departments && (
                        <p className="text-xs">Departments: {a.departments.join(", ")}</p>
                      )}
                      {a.standDownRationale && (
                        <p className="text-xs">Stand-down: {a.standDownRationale}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {i.relatedIds.length > 0 && (
              <Card title="Related incidents">
                {i.relatedIds.map((r) => (
                  <Link
                    key={r}
                    to="/admin/incidents/$id"
                    params={{ id: r }}
                    className="block text-sm text-primary underline"
                  >
                    {r}
                  </Link>
                ))}
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <Card
            title="Tasks"
            actions={
              <PlaybookButton
                i={i}
                onApply={(patch, summary) => update.mutate({ patch, summary })}
              />
            }
          >
            {PHASES.map((p) => {
              const ts = i.tasks.filter((x) => x.phase === p);
              if (!ts.length) return null;
              return (
                <div key={p} className="mb-4">
                  <p className="mb-2 text-sm font-semibold">{t(`phase.${p}`)}</p>
                  {ts.map((tk) => (
                    <label
                      key={tk.id}
                      className="flex items-center gap-3 rounded-md p-2 hover:bg-muted"
                    >
                      <Checkbox
                        checked={tk.done}
                        onCheckedChange={(c) =>
                          update.mutate({
                            patch: {
                              tasks: i.tasks.map((x) => (x.id === tk.id ? { ...x, done: !!c } : x)),
                            },
                            summary: `Task “${tk.title}” ${c ? "done" : "reopened"}`,
                          })
                        }
                      />
                      <span className={cn(tk.done && "line-through text-muted-foreground")}>
                        {tk.title}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {roles.find((r) => r.id === tk.roleId)?.name}
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}
            <AddLine
              placeholder="Add a task"
              onAdd={(title) =>
                update.mutate({
                  patch: {
                    tasks: [
                      ...i.tasks,
                      {
                        id: crypto.randomUUID(),
                        title,
                        phase: i.phase,
                        roleId: "r-lead",
                        done: false,
                      },
                    ],
                  },
                  summary: `Task added: ${title}`,
                })
              }
            />
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card
            title="Audit trail"
            takeaway="Entries cannot be edited or deleted. Escalations and overrides are highlighted."
          >
            <ol className="space-y-3">
              {[...i.timeline]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((e) => (
                  <li
                    key={e.id}
                    className={cn(
                      "border-l-2 pl-3",
                      e.highlight ? "border-sev-3" : "border-border",
                    )}
                  >
                    <p className="text-xs text-muted-foreground">
                      {both(e.at)} · {e.actor} · {e.kind}
                    </p>
                    <p className={cn(e.highlight && "font-semibold")}>{e.text}</p>
                  </li>
                ))}
            </ol>
            <div className="mt-4">
              <AddLine
                placeholder="Add a note to the timeline"
                onAdd={(text) =>
                  update.mutate({
                    patch: {
                      timeline: [
                        ...i.timeline,
                        {
                          id: crypto.randomUUID(),
                          at: new Date().toISOString(),
                          actor: currentActor().name,
                          kind: "note",
                          text,
                        },
                      ],
                    },
                    summary: "Note added",
                  })
                }
              />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="decisions">
          <Card title="Decision log" takeaway="What was decided, by whom, when and why.">
            <DecisionForm
              examples={decisionExamples}
              onAdd={(what, why) =>
                update.mutate({
                  patch: {
                    decisions: [
                      ...i.decisions,
                      {
                        id: crypto.randomUUID(),
                        what,
                        why,
                        by: currentActor().name,
                        at: new Date().toISOString(),
                      },
                    ],
                    timeline: [
                      ...i.timeline,
                      {
                        id: crypto.randomUUID(),
                        at: new Date().toISOString(),
                        actor: currentActor().name,
                        kind: "decision",
                        text: `Decision: ${what}`,
                      },
                    ],
                  },
                  summary: `Decision: ${what}`,
                })
              }
            />
            <ul className="mt-4 space-y-2">
              {[...i.decisions].reverse().map((d) => (
                <li
                  key={d.id}
                  className={cn("rounded-md border p-3", d.override && "border-sev-3 bg-sev-3/10")}
                >
                  <p className="font-semibold">
                    {d.what} {d.override && <Pill tone="warn">Override</Pill>}
                  </p>
                  <p className="text-sm">Why: {d.why}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.by} · {both(d.at)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="communication">
          <Card
            title="Updates"
            takeaway="Draft internal and external messages. Sending is simulated."
          >
            <CommForm
              templates={[...(proc?.templates ?? []), ...commExamples]}
              onAdd={(c) =>
                update.mutate({
                  patch: { comms: [...i.comms, c] },
                  summary: `Draft update: ${c.title}`,
                })
              }
            />
            <ul className="mt-4 space-y-2">
              {i.comms.map((c) => (
                <li key={c.id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Pill tone={c.audience === "external" ? "warn" : "neutral"}>{c.audience}</Pill>
                    <Pill tone={c.status === "sent" ? "primary" : "neutral"}>{c.status}</Pill>
                    <span className="font-semibold">{c.title}</span>
                  </div>
                  <p className="mt-1 text-sm">{c.body}</p>
                  {c.status === "draft" && (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        update.mutate({
                          patch: {
                            comms: i.comms.map((x) =>
                              x.id === c.id
                                ? { ...x, status: "sent", at: new Date().toISOString() }
                                : x,
                            ),
                          },
                          summary: `Sent update: ${c.title}`,
                        })
                      }
                    >
                      Mark as sent
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="evidence">
          <Card title="Evidence and attachments">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
              <Paperclip className="size-4" /> Add file (stored as metadata in demo mode)
              <input
                type="file"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    update.mutate({
                      patch: {
                        attachments: [
                          ...i.attachments,
                          {
                            id: crypto.randomUUID(),
                            name: f.name,
                            size: f.size,
                            at: new Date().toISOString(),
                            by: currentActor().name,
                          },
                        ],
                      },
                      summary: `Attachment ${f.name}`,
                    });
                }}
              />
            </label>
            <ul className="mt-3 space-y-1 text-sm">
              {i.attachments.map((a) => (
                <li key={a.id} className="flex justify-between border-b py-1">
                  <span>{a.name}</span>
                  <span className="text-muted-foreground">
                    {Math.round(a.size / 1024)} KB · {a.by} · {rel(a.at)}
                  </span>
                </li>
              ))}
            </ul>
            {!i.attachments.length && (
              <p className="mt-2 text-sm text-muted-foreground">No attachments yet.</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reporting">
          <Card
            title="Reporting deadlines"
            takeaway={t("admin.legal")}
            actions={
              i.deadlines.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (
                      confirm(
                        "Recalculate deadlines with the current rules? The stored snapshot will be replaced and this is logged.",
                      )
                    ) {
                      await repos().incidents.reapplyRules(id);
                      update.reset();
                      toast.success("Deadlines reapplied");
                      location.reload();
                    }
                  }}
                >
                  <RefreshCw className="size-4" /> Reapply current rules
                </Button>
              )
            }
          >
            {i.deadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reporting rules apply to this incident.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1">Rule</th>
                    <th>Stage</th>
                    <th>Due</th>
                    <th>Countdown</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {i.deadlines.map((d) => {
                    const c = countdown(d.dueAt);
                    return (
                      <tr key={d.id} className="border-t">
                        <td className="py-2">
                          {d.ruleName}{" "}
                          <span className="text-xs text-muted-foreground">v{d.ruleVersion}</span>
                        </td>
                        <td>{d.stage}</td>
                        <td>{abs(d.dueAt)}</td>
                        <td
                          className={cn(
                            c.overdue &&
                              d.status !== "submitted" &&
                              "font-semibold text-destructive",
                          )}
                        >
                          {d.status === "submitted" ? "—" : c.text}
                        </td>
                        <td>
                          <Pill
                            tone={
                              d.status === "submitted"
                                ? "primary"
                                : c.overdue
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {d.status === "submitted"
                              ? "Submitted"
                              : c.overdue
                                ? "Overdue"
                                : "Open"}
                          </Pill>
                        </td>
                        <td>
                          {d.status !== "submitted" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                update.mutate({
                                  patch: {
                                    deadlines: i.deadlines.map((x) =>
                                      x.id === d.id ? { ...x, status: "submitted" } : x,
                                    ),
                                  },
                                  summary: `Deadline “${d.stage}” submitted`,
                                })
                              }
                            >
                              <Check className="size-4" /> Submitted
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <Card title="Post-incident review">
            <Textarea
              defaultValue={i.reviewNotes}
              placeholder="What went well? What can be better?"
              onBlur={(e) =>
                e.target.value !== (i.reviewNotes ?? "") &&
                update.mutate({
                  patch: { reviewNotes: e.target.value },
                  summary: "Review notes updated",
                })
              }
            />
            <p className="mt-4 mb-2 font-semibold">Improvement actions</p>
            {i.actions.map((a) => (
              <label key={a.id} className="flex items-center gap-3 p-1">
                <Checkbox
                  checked={a.done}
                  onCheckedChange={(c) =>
                    update.mutate({
                      patch: {
                        actions: i.actions.map((x) => (x.id === a.id ? { ...x, done: !!c } : x)),
                      },
                      summary: `Action ${a.title}`,
                    })
                  }
                />
                <span className={cn(a.done && "line-through")}>{a.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {a.owner} · due {abs(a.due, false)}
                </span>
              </label>
            ))}
            <AddLine
              placeholder="Add improvement action"
              onAdd={(title) =>
                update.mutate({
                  patch: {
                    actions: [
                      ...i.actions,
                      {
                        id: crypto.randomUUID(),
                        title,
                        owner: i.ownerId,
                        due: new Date(Date.now() + 30 * 864e5).toISOString(),
                        done: false,
                      },
                    ],
                  },
                  summary: `Improvement action: ${title}`,
                })
              }
            />
          </Card>
        </TabsContent>
      </Tabs>

      <PhaseDialog
        open={dialog === "phase"}
        onClose={() => setDialog(null)}
        i={i}
        onConfirm={() =>
          update.mutate({
            patch: {
              phase: PHASES[pIdx + 1],
              closedAt: PHASES[pIdx + 1] === "close" ? new Date().toISOString() : undefined,
            },
            summary: `Phase → ${PHASES[pIdx + 1]}`,
          })
        }
      />
      <IrtDialog open={dialog === "irt"} onClose={() => setDialog(null)} i={i} />
      <CrtDialog open={dialog === "crt"} onClose={() => setDialog(null)} i={i} />
      <StandDown open={dialog === "standdown"} onClose={() => setDialog(null)} i={i} />
    </div>
  );
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) {
          onAdd(v.trim());
          setV("");
        }
      }}
    >
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <Button type="submit" variant="outline" disabled={!v.trim()}>
        Add
      </Button>
    </form>
  );
}
function DecisionForm({
  onAdd,
  examples,
}: {
  onAdd: (what: string, why: string) => void;
  examples: { what: string; why: string; playbook: string }[];
}) {
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");
  return (
    <form
      className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(what, why);
        setWhat("");
        setWhy("");
      }}
    >
      {examples.length > 0 && (
        <select
          className="rounded-md border bg-card p-2 text-sm md:col-span-3"
          aria-label={t("templates.playbook.examples")}
          value=""
          onChange={(e) => {
            const x = examples[Number(e.target.value)];
            if (x) {
              setWhat(x.what);
              setWhy(x.why);
            }
          }}
        >
          <option value="">{t("templates.playbook.pickExample")}</option>
          {examples.map((x, k) => (
            <option key={k} value={k}>
              {x.playbook}: {x.what}
            </option>
          ))}
        </select>
      )}
      <Input
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        placeholder="What was decided?"
        aria-label="Decision"
      />
      <Input
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Why?"
        aria-label="Rationale"
      />
      <Button disabled={!what || !why}>Record decision</Button>
    </form>
  );
}
function CommForm({
  templates,
  onAdd,
}: {
  templates: { title: string; body: string }[];
  onAdd: (c: Incident["comms"][number]) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aud, setAud] = useState<"internal" | "external">("internal");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({
          id: crypto.randomUUID(),
          audience: aud,
          title,
          body,
          status: "draft",
          at: new Date().toISOString(),
        });
        setTitle("");
        setBody("");
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select
          value={aud}
          onChange={(e) => setAud(e.target.value as "internal")}
          className="rounded-md border bg-card px-2"
          aria-label="Audience"
        >
          <option value="internal">Internal</option>
          <option value="external">External</option>
        </select>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="flex-1"
          aria-label="Title"
        />
        {templates.map((tp, k) => (
          <Button
            key={`${k}-${tp.title}`}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setTitle(tp.title);
              setBody(tp.body);
            }}
          >
            Use “{tp.title}”
          </Button>
        ))}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Message"
        aria-label="Message"
      />
      <Button disabled={!title || !body}>Save draft</Button>
    </form>
  );
}

function PhaseDialog({
  open,
  onClose,
  i,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  i: Incident;
  onConfirm: () => void;
}) {
  const next = PHASES[PHASES.indexOf(i.phase) + 1];
  if (!next) return null;
  const openTasks = i.tasks.filter((x) => x.phase === i.phase && !x.done).length;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to {t(`phase.${next}`)}?</DialogTitle>
          <DialogDescription>
            Check that the exit condition is met: {PHASE_COND[i.phase].exit}
          </DialogDescription>
        </DialogHeader>
        {openTasks > 0 && (
          <p className="flex items-center gap-2 rounded-md bg-sev-3/20 p-2 text-sm">
            <AlertTriangle className="size-4" /> {openTasks} task(s) in this phase are still open.
          </p>
        )}
        <p className="text-sm">
          What happens: the phase changes for everyone, and this is recorded in the audit trail.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IrtDialog({ open, onClose, i }: { open: boolean; onClose: () => void; i: Incident }) {
  const { data: s } = useSettings();
  const depts = s?.masterData.departments ?? [];
  const [sel, setSel] = useState<string[]>([]);
  const [why, setWhy] = useState("");
  const act = useAction(() =>
    repos().incidents.activate(i.id, { team: "irt", rationale: why, departments: sel }),
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Activate the Incident Response Team (IRT)</DialogTitle>
          <DialogDescription>
            The IRT is for incidents that cross departmental boundaries.{" "}
            {i.domain === "security" && t("csirt")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted p-3">
            <p className="font-semibold">What changes</p>
            <ul className="list-disc pl-5">
              <li>
                The IRT coordinator takes over coordination; the specialist lead keeps domain
                ownership.
              </li>
              <li>Selected departments are notified and join one shared picture.</li>
              <li>Response level becomes Coordinated.</li>
            </ul>
          </div>
          <p className="font-semibold">Which departments are involved?</p>
          <div className="grid grid-cols-2 gap-1">
            {depts.map((d) => (
              <label key={d} className="flex items-center gap-2">
                <Checkbox
                  checked={sel.includes(d)}
                  onCheckedChange={(c) => setSel(c ? [...sel, d] : sel.filter((x) => x !== d))}
                />{" "}
                {d}
              </label>
            ))}
          </div>
          {sel.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Only one department? Elevated level may be enough.
            </p>
          )}
          <label className="block font-semibold">
            Why is cross-department coordination needed?
            <Textarea value={why} onChange={(e) => setWhy(e.target.value)} className="mt-1" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={sel.length < 2 || why.length < 5 || act.isPending}
            onClick={async () => {
              await act.mutateAsync(undefined);
              toast.success("IRT activated");
              onClose();
            }}
          >
            Activate IRT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CrtDialog({ open, onClose, i }: { open: boolean; onClose: () => void; i: Incident }) {
  const [happening, setH] = useState<boolean | null>(null);
  const [critical, setC] = useState<boolean | null>(null);
  const [why, setWhy] = useState("");
  const [override, setOverride] = useState(false);
  const act = useAction((a: { override: boolean }) =>
    repos().incidents.activate(i.id, {
      team: "crt",
      rationale: why,
      happening: !!happening,
      critical: !!critical,
      override: a.override,
    }),
  );
  const answered = happening !== null && critical !== null;
  const applies = answered && crtApplies(happening!, critical!);
  const reset = () => {
    setH(null);
    setC(null);
    setWhy("");
    setOverride(false);
    onClose();
  };
  const YN = ({ v, set }: { v: boolean | null; set: (b: boolean) => void }) => (
    <div className="mt-1 flex gap-2">
      <Button size="sm" variant={v === true ? "default" : "outline"} onClick={() => set(true)}>
        Yes
      </Button>
      <Button size="sm" variant={v === false ? "default" : "outline"} onClick={() => set(false)}>
        No
      </Button>
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Does this need the Critical Response Team (CRT)?</DialogTitle>
          <DialogDescription>
            The CRT is only for situations where both answers are yes.{" "}
            {i.domain === "security" && t("cert")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold">
              1. Is the event already happening, or is it virtually unavoidable?
            </p>
            <YN v={happening} set={setH} />
          </div>
          <div>
            <p className="font-semibold">
              2. Is the impact critical, or will it be critical if it happens?
            </p>
            <YN v={critical} set={setC} />
          </div>
          {answered && !applies && (
            <div className="rounded-md bg-muted p-3">
              <p className="font-semibold">The CRT does not apply</p>
              <p>{crtExplanation(happening!, critical!)}</p>
              <p className="mt-1">
                Suggested alternative: keep or activate the IRT and set a review moment.
              </p>
              <label className="mt-3 flex items-center gap-2">
                <Checkbox checked={override} onCheckedChange={(c) => setOverride(!!c)} /> I want to
                override and activate the CRT anyway
              </label>
            </div>
          )}
          {answered && applies && (
            <div className="rounded-md bg-sev-4/10 p-3">
              <p className="font-semibold">The CRT applies.</p>
              <p>
                What changes: the CRT chair takes strategic lead, the IRT supports operationally,
                public communication requires CRT approval.
              </p>
            </div>
          )}
          {(applies || override) && (
            <label className="block font-semibold">
              Rationale (required){override && " — this override is highlighted in the audit trail"}
              <Textarea value={why} onChange={(e) => setWhy(e.target.value)} className="mt-1" />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={reset}>
            Cancel
          </Button>
          {(applies || override) && (
            <Button
              variant={override ? "outline" : "default"}
              disabled={why.length < 10 || act.isPending}
              onClick={async () => {
                await act.mutateAsync({ override });
                toast.success("CRT activated");
                reset();
              }}
            >
              {override ? "Override and activate CRT" : "Activate CRT"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StandDown({ open, onClose, i }: { open: boolean; onClose: () => void; i: Incident }) {
  const [why, setWhy] = useState("");
  const upd = useAction(() =>
    repos().incidents.update(
      i.id,
      {
        activations: i.activations.map((a) =>
          a.team === "crt" && !a.stoodDownAt
            ? { ...a, stoodDownAt: new Date().toISOString(), standDownRationale: why }
            : a,
        ),
        level: "coordinated",
        timeline: [
          ...i.timeline,
          {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            actor: currentActor().name,
            kind: "activation",
            text: `CRT stood down: ${why}`,
            highlight: true,
          },
        ],
      },
      "CRT stood down",
      true,
    ),
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stand down the CRT</DialogTitle>
          <DialogDescription>
            The IRT continues coordination. A rationale is required.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Why is the CRT no longer needed?"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={why.length < 10}
            onClick={async () => {
              await upd.mutateAsync(undefined);
              onClose();
            }}
          >
            Stand down
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
