import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { PageHeader, Card, Term } from "@/features/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAction, useProcesses, useRoles, useRules } from "@/shared/hooks";
import { LEVELS, PHASES, type Process } from "@/domain/types";
import { repos } from "@/data";
import { t } from "@/i18n";
import { LevelBadge, PhaseBadge } from "@/shared/components/badges";

import { TemplateButton } from "@/shared/components/TemplatePicker";
export const Route = createFileRoute("/admin/processes")({
  head: () => ({
    meta: [
      { title: "Processes — IRTrack" },
      { name: "description", content: "Configure processes and map them to the universal model." },
      { property: "og:title", content: "Processes — IRTrack" },
      {
        property: "og:description",
        content: "Configure processes and map them to the universal model.",
      },
    ],
  }),
  component: Processes,
});

function Processes() {
  const { data: processes = [] } = useProcesses();
  const { data: roles = [] } = useRoles();
  const { data: rules = [] } = useRules();
  const [sel, setSel] = useState<Process | null>(null);
  const save = useAction((p: Process) => repos().processes.save(p));
  return (
    <div>
      <PageHeader
        title="Processes"
        description="Each process maps its own terms to the universal phases and response levels. No code needed."
        actions={<TemplateButton kind="processes" />}
      />
      <Card
        title="Mapping to the universal model"
        takeaway="Empty cells mean a missing mapping."
        className="mb-4 overflow-x-auto"
      >
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Universal</th>
              {processes.map((p) => (
                <th key={p.id} className="p-2">
                  <button
                    className="text-left text-primary underline"
                    onClick={() => setSel(structuredClone(p))}
                  >
                    {p.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PHASES.map((ph) => (
              <tr key={ph} className="border-t">
                <td className="p-2">
                  <PhaseBadge p={ph} />
                </td>
                {processes.map((p) => (
                  <td key={p.id} className="p-2">
                    {p.phaseNames[ph] || (
                      <span className="text-destructive">
                        <AlertTriangle className="inline size-3" /> missing
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {LEVELS.map((l) => (
              <tr key={l} className="border-t">
                <td className="p-2">
                  <LevelBadge l={l} />
                </td>
                {processes.map((p) => (
                  <td key={p.id} className="p-2">
                    {p.levelNames[l] || (
                      <span className="text-destructive">
                        <AlertTriangle className="inline size-3" /> missing
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("csirt")} {t("cert")} These are informational aliases only.
        </p>
      </Card>
      {sel && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title={`Configure: ${sel.name} (v${sel.version})`}
            takeaway="Saving creates a new version. Active incidents stay linked to the version they started with."
          >
            <div className="space-y-3 text-sm">
              <label className="block">
                Name
                <Input
                  value={sel.name}
                  onChange={(e) => setSel({ ...sel, name: e.target.value })}
                />
              </label>
              <label className="block">
                Purpose
                <Input
                  value={sel.purpose}
                  onChange={(e) => setSel({ ...sel, purpose: e.target.value })}
                />
              </label>
              <p className="font-semibold">Phase names</p>
              <div className="grid grid-cols-2 gap-2">
                {PHASES.map((ph) => (
                  <label key={ph} className="block text-xs">
                    {t(`phase.${ph}`)}
                    <Input
                      value={sel.phaseNames[ph]}
                      onChange={(e) =>
                        setSel({ ...sel, phaseNames: { ...sel.phaseNames, [ph]: e.target.value } })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="font-semibold">Response level names</p>
              <div className="grid grid-cols-2 gap-2">
                {LEVELS.map((l) => (
                  <label key={l} className="block text-xs">
                    {t(`level.${l}`)}
                    <Input
                      value={sel.levelNames[l]}
                      onChange={(e) =>
                        setSel({ ...sel, levelNames: { ...sel.levelNames, [l]: e.target.value } })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="block">
                Triage questions (one per line)
                <Textarea
                  value={sel.triage.join("\n")}
                  onChange={(e) => setSel({ ...sel, triage: e.target.value.split("\n") })}
                />
              </label>
              <label className="block">
                <Term k="IRT">IRT</Term> activation criteria
                <Input
                  value={sel.irtCriteria}
                  onChange={(e) => setSel({ ...sel, irtCriteria: e.target.value })}
                />
              </label>
              <label className="block">
                <Term k="CRT">CRT</Term> activation criteria
                <Input
                  value={sel.crtCriteria}
                  onChange={(e) => setSel({ ...sel, crtCriteria: e.target.value })}
                />
              </label>
              <fieldset>
                <legend className="font-semibold">Roles</legend>
                <div className="grid grid-cols-2 gap-1">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sel.roleIds.includes(r.id)}
                        onChange={(e) =>
                          setSel({
                            ...sel,
                            roleIds: e.target.checked
                              ? [...sel.roleIds, r.id]
                              : sel.roleIds.filter((x) => x !== r.id),
                          })
                        }
                      />
                      {r.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="font-semibold">Reporting rules</legend>
                {rules.map((r) => (
                  <label key={r.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sel.reportingRuleIds.includes(r.id)}
                      onChange={(e) =>
                        setSel({
                          ...sel,
                          reportingRuleIds: e.target.checked
                            ? [...sel.reportingRuleIds, r.id]
                            : sel.reportingRuleIds.filter((x) => x !== r.id),
                        })
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </fieldset>
              <p className="font-semibold">Default tasks</p>
              <ul className="list-disc pl-5">
                {sel.tasks.map((tk, i) => (
                  <li key={i}>
                    {t(`phase.${tk.phase}`)}: {tk.title}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSel(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const n = await save.mutateAsync(sel);
                    setSel(n);
                    toast.success(`Saved as v${n.version}`);
                  }}
                >
                  Save new version
                </Button>
              </div>
            </div>
          </Card>
          <Card title="This is how this process looks to a user">
            <ol className="space-y-2">
              {LEVELS.map((l, i) => (
                <li key={l} className="rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Level {i + 1}</span>
                  <p className="font-semibold">{sel.levelNames[l]}</p>
                  <p className="text-sm text-muted-foreground">{t(`levelHelp.${l}`)}</p>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-1">
              {PHASES.map((ph) => (
                <PhaseBadge key={ph} p={ph} local={sel.phaseNames[ph]} />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
