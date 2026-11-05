import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction, useTemplates } from "@/shared/hooks";
import { repos } from "@/data";
import type { TemplateApplyResult, TemplateKind } from "@/domain/types";
import { PermissionGate, type Permission } from "@/auth/permissions";
import { t } from "@/i18n";
import { Pill } from "./badges";

const EDIT_PERMISSION: Record<TemplateKind, Permission> = {
  contacts: "contact.edit",
  roles: "role.edit",
  rules: "rule.edit",
  processes: "process.edit",
  guidance: "guidance.edit",
  sources: "source.import",
};

function summarize(r: TemplateApplyResult, kind: TemplateKind) {
  if (!r.added.length) return t("templates.nothingAdded");
  const deps = r.added.filter((a) => a.kind !== kind).map((a) => a.name);
  return deps.length
    ? t("templates.addedWithDeps", { n: r.added.length, names: deps.join(", ") })
    : t("templates.added", { n: r.added.length });
}

/** Checklist of templates of one kind; already added items are shown but cannot be selected. */
export function TemplatePicker({
  kind,
  onApplied,
}: {
  kind: TemplateKind;
  onApplied?: (r: TemplateApplyResult) => void;
}) {
  const { data: items = [], isLoading } = useTemplates(kind);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const apply = useAction((ids: string[]) => repos().templates.apply(kind, ids));
  const available = items.filter((i) => !i.exists);
  const groups = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const i of items) m.set(i.group ?? "", [...(m.get(i.group ?? "") ?? []), i]);
    return [...m];
  }, [items]);
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const submit = async () => {
    const r = await apply.mutateAsync([...sel]);
    setSel(new Set());
    toast.success(summarize(r, kind));
    onApplied?.(r);
  };

  if (isLoading) return <p role="status">{t("common.loading")}</p>;
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("templates.none")}</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setSel(new Set(available.map((i) => i.id)))}
          disabled={!available.length}
        >
          {t("templates.selectAll")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setSel(new Set())}
          disabled={!sel.size}
        >
          {t("templates.selectNone")}
        </Button>
        <PermissionGate action={EDIT_PERMISSION[kind]}>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={!sel.size || apply.isPending}
            onClick={submit}
          >
            {t("templates.addSelected", { n: sel.size })}
          </Button>
        </PermissionGate>
      </div>
      <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
        {groups.map(([group, xs]) => (
          <fieldset key={group}>
            {group && (
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </legend>
            )}
            <ul className="space-y-1">
              {xs.map((i) => (
                <li key={i.id}>
                  <label
                    className={`flex gap-3 rounded-md border p-2 text-sm ${i.exists ? "opacity-60" : "cursor-pointer hover:bg-muted"}`}
                  >
                    {i.exists ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={sel.has(i.id)}
                        onChange={() => toggle(i.id)}
                      />
                    )}
                    <span className="min-w-0">
                      <span className="font-medium">{i.name}</span>{" "}
                      {i.exists && <Pill>{t("templates.alreadyAdded")}</Pill>}
                      <span className="block text-muted-foreground">{i.description}</span>
                      {!i.exists && i.requires.length > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {t("templates.requires", { names: i.requires.join(", ") })}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

/** "Add from templates" button that opens the picker in a dialog. */
export function TemplateButton({
  kind,
  size = "default",
  variant = "outline",
}: {
  kind: TemplateKind;
  size?: "default" | "sm";
  variant?: "outline" | "default" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)}>
        <LayoutTemplate className="size-4" /> {t("templates.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("templates.title")} · {t(`templates.kind.${kind}`)}
            </DialogTitle>
            <DialogDescription>{t("templates.intro")}</DialogDescription>
          </DialogHeader>
          <TemplatePicker kind={kind} onApplied={(r) => r.added.length && setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
