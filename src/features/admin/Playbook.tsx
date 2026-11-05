import { useMemo, useState } from "react";
import { BookCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlaybooks, useRoles } from "@/shared/hooks";
import type { Incident, Playbook } from "@/domain/types";
import { currentActor } from "@/auth/actor";
import { t } from "@/i18n";

type Sel = { tasks: Set<number>; comms: Set<number>; actions: Set<number> };
const all = (pb: Playbook): Sel => ({
  tasks: new Set(pb.tasks.map((_, k) => k)),
  comms: new Set(pb.comms.map((_, k) => k)),
  actions: new Set(pb.actions.map((_, k) => k)),
});

/** Builds the incident patch for the chosen parts of a playbook. */
function toPatch(i: Incident, pb: Playbook, sel: Sel, roleIds: Set<string>): Partial<Incident> {
  const at = new Date().toISOString();
  const due = new Date(Date.now() + 30 * 864e5).toISOString();
  return {
    // Tasks keep their role only if that role exists in this installation.
    tasks: [
      ...i.tasks,
      ...pb.tasks
        .filter((_, k) => sel.tasks.has(k))
        .map((x) => ({
          id: crypto.randomUUID(),
          title: x.title,
          phase: x.phase,
          roleId: roleIds.has(x.roleId) ? x.roleId : "",
          done: false,
        })),
    ],
    comms: [
      ...i.comms,
      ...pb.comms
        .filter((_, k) => sel.comms.has(k))
        .map((x) => ({
          id: crypto.randomUUID(),
          audience: x.audience,
          title: x.title,
          body: x.body,
          status: "draft" as const,
          at,
        })),
    ],
    actions: [
      ...i.actions,
      ...pb.actions
        .filter((_, k) => sel.actions.has(k))
        .map((x) => ({
          id: crypto.randomUUID(),
          title: x.title,
          owner: i.ownerId,
          due,
          done: false,
        })),
    ],
    timeline: [
      ...i.timeline,
      {
        id: crypto.randomUUID(),
        at,
        actor: currentActor().name,
        kind: "note",
        text: t("templates.playbook.applied", { name: pb.name }),
      },
    ],
  };
}

export function PlaybookButton({
  i,
  onApply,
}: {
  i: Incident;
  onApply: (patch: Partial<Incident>, summary: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: playbooks = [] } = usePlaybooks();
  const { data: roles = [] } = useRoles();
  const [pbId, setPbId] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const ordered = useMemo(
    () =>
      [...playbooks].sort((a, b) => Number(b.domain === i.domain) - Number(a.domain === i.domain)),
    [playbooks, i.domain],
  );
  const pb = playbooks.find((p) => p.id === pbId) ?? ordered[0];
  const s = sel ?? (pb ? all(pb) : null);
  const choose = (id: string) => {
    setPbId(id);
    const next = playbooks.find((p) => p.id === id);
    setSel(next ? all(next) : null);
  };
  const flip = (part: keyof Sel, k: number) => {
    if (!s) return;
    const n = new Set(s[part]);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setSel({ ...s, [part]: n });
  };
  const count = s ? s.tasks.size + s.comms.size + s.actions.size : 0;
  const Section = ({ part, title, items }: { part: keyof Sel; title: string; items: string[] }) =>
    items.length ? (
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold">{title}</legend>
        <ul className="mt-1 space-y-1 text-sm">
          {items.map((x, k) => (
            <li key={k}>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={s?.[part].has(k) ?? false}
                  onChange={() => flip(part, k)}
                />
                {x}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    ) : null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!playbooks.length}
      >
        <BookCheck className="size-4" /> {t("templates.playbook.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("templates.playbook.title")}</DialogTitle>
            <DialogDescription>{t("templates.playbook.intro")}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto md:grid-cols-[220px_1fr]">
            <ul className="space-y-1">
              {ordered.map((p, k) => (
                <li key={p.id}>
                  {k === 0 && p.domain === i.domain && (
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      {t("templates.playbook.recommended")}
                    </p>
                  )}
                  {k > 0 && p.domain !== i.domain && ordered[k - 1].domain === i.domain && (
                    <p className="mt-3 mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      {t("templates.playbook.others")}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => choose(p.id)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${pb?.id === p.id ? "bg-muted font-semibold" : ""}`}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
            {pb && (
              <div>
                <p className="text-sm text-muted-foreground">{pb.description}</p>
                <Section
                  part="tasks"
                  title={t("templates.playbook.tasks")}
                  items={pb.tasks.map((x) => `${t(`phase.${x.phase}`)}: ${x.title}`)}
                />
                <Section
                  part="comms"
                  title={t("templates.playbook.comms")}
                  items={pb.comms.map((x) => `${x.audience} · ${x.title}`)}
                />
                <Section
                  part="actions"
                  title={t("templates.playbook.actions")}
                  items={pb.actions.map((x) => x.title)}
                />
                {pb.decisions.length > 0 && (
                  <div className="mt-3 text-sm">
                    <p className="font-semibold">{t("templates.playbook.decisions")}</p>
                    <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                      {pb.decisions.map((d) => (
                        <li key={d.what}>
                          {d.what} — {d.why}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!pb || !s || count === 0}
              onClick={() => {
                onApply(
                  toPatch(i, pb!, s!, new Set(roles.map((r) => r.id))),
                  `Playbook ${pb!.name} applied`,
                );
                setOpen(false);
              }}
            >
              {t("templates.playbook.apply")} ({count})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Example decisions from the playbooks, the ones for this domain first. */
export function useDecisionExamples(domain: Incident["domain"]) {
  const { data: playbooks = [] } = usePlaybooks();
  return useMemo(
    () =>
      [...playbooks]
        .sort((a, b) => Number(b.domain === domain) - Number(a.domain === domain))
        .flatMap((p) => p.decisions.map((d) => ({ ...d, playbook: p.name }))),
    [playbooks, domain],
  );
}

/** Draft-message examples from the playbooks for this domain. */
export function useCommExamples(domain: Incident["domain"]) {
  const { data: playbooks = [] } = usePlaybooks();
  return useMemo(
    () =>
      playbooks
        .filter((p) => p.domain === domain)
        .flatMap((p) => p.comms.map((c) => ({ title: c.title, body: c.body }))),
    [playbooks, domain],
  );
}
