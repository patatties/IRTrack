import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  CheckCheck,
  Download,
  Pencil,
  Plus,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/features/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction, useContacts, useRoles, useSettings } from "@/shared/hooks";
import { repos } from "@/data";
import { ContactSchema, LEVELS, type Contact, type ContactInput } from "@/domain/types";
import { RoleContacts, RoleLadder } from "@/shared/components/RoleLadder";
import { t } from "@/i18n";
import { Pill } from "@/shared/components/badges";
import { abs } from "@/shared/format";
import { PermissionGate } from "@/auth/permissions";

import { TemplateButton } from "@/shared/components/TemplatePicker";
export const Route = createFileRoute("/admin/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts — IRTrack" },
      { name: "description", content: "Manage people, teams, mailboxes and suppliers." },
      { property: "og:title", content: "Contacts — IRTrack" },
      { property: "og:description", content: "Manage people, teams, mailboxes and suppliers." },
    ],
  }),
  component: ContactsAdmin,
});

const EMPTY: ContactInput = {
  name: "",
  type: "person",
  role: "",
  team: "",
  organization: "",
  phone: "",
  mobile: "",
  email: "",
  availability: "",
  timezone: "Europe/Amsterdam",
  outOfHours: "",
  whenToContact: "",
  backupId: "",
  notes: "",
  emergency: false,
  roleIds: [],
};

function ContactsAdmin() {
  const [showArchived, setShowArchived] = useState(false);
  const { data = [] } = useContacts({ includeArchived: showArchived });
  const { data: s } = useSettings();
  const [edit, setEdit] = useState<Contact | "new" | null>(null);
  const [view, setView] = useState<"ladder" | "table">("ladder");
  const { data: roles = [] } = useRoles();
  const archive = useAction((a: { id: string; v: boolean }) => repos().contacts.archive(a.id, a.v));
  const move = useAction((a: { id: string; d: -1 | 1 }) => repos().contacts.move(a.id, a.d));
  const verify = useAction((id: string) => repos().contacts.verify(id));
  const imp = useAction((csv: string) => repos().contacts.importCsv(csv));
  const days = s?.portal.contactVerificationDays ?? 180;
  const exportCsv = () => {
    const rows = [
      ["name", "role", "team", "phone", "email", "availability"],
      ...data.map((c) => [c.name, c.role, c.team, c.phone, c.email, c.availability]),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n")], {
        type: "text/csv",
      }),
    );
    a.download = "irtrack-contacts.csv";
    a.click();
  };
  return (
    <div>
      <PageHeader
        title="Contacts"
        description={`People, teams, mailboxes, suppliers and external parties. Contacts not verified in ${days} days are flagged.`}
        actions={
          <PermissionGate action="contact.edit">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted">
              <Upload className="size-4" /> Import CSV
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    toast.success(`${await imp.mutateAsync(await f.text())} contacts imported`);
                }}
              />
            </label>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <TemplateButton kind="contacts" />
            <Button onClick={() => setEdit("new")}>
              <Plus className="size-4" /> New contact
            </Button>
          </PermissionGate>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="View">
          {(["ladder", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded px-3 py-1 ${view === v ? "bg-muted font-semibold" : ""}`}
            >
              {t(v === "ladder" ? "contacts.ladder.viewLadder" : "contacts.ladder.viewTable")}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />{" "}
          Show archived
        </label>
      </div>
      {view === "ladder" && (
        <div>
          <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
            {t("contacts.ladder.intro")}
          </p>
          <RoleLadder
            roles={roles}
            contacts={data}
            emptyLevel={<p className="text-sm text-muted-foreground">{t("roles.none")}</p>}
            renderRole={(r, cs) => (
              <div className="h-full rounded-lg border bg-card p-3 shadow-card">
                <p className="font-semibold">{r.name}</p>
                <p className="mb-2 text-xs text-muted-foreground">{r.summary}</p>
                <RoleContacts contacts={cs} onPick={(c) => setEdit(c)} />
              </div>
            )}
            renderContact={(c) => (
              <button
                type="button"
                onClick={() => setEdit(c)}
                className={`w-full rounded-lg border p-3 text-left text-sm hover:bg-muted ${c.archived ? "opacity-50" : ""}`}
              >
                <p className="font-medium">
                  {c.name} {c.emergency && <Pill tone="danger">Emergency</Pill>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.role} · {c.team}
                </p>
                <p className="mt-1 text-xs">
                  {c.phone || <span className="text-destructive">No phone number</span>}
                  {c.availability && (
                    <span className="text-muted-foreground"> · {c.availability}</span>
                  )}
                </p>
              </button>
            )}
          />
        </div>
      )}
      {view === "table" && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Order</th>
                <th>Name</th>
                <th>{t("roles.rolesField")}</th>
                <th>Type</th>
                <th>Phone / email</th>
                <th>Availability</th>
                <th>Verified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const stale = differenceInDays(new Date(), new Date(c.lastVerifiedAt)) > days;
                return (
                  <tr key={c.id} className={`border-t ${c.archived ? "opacity-50" : ""}`}>
                    <td className="p-2">
                      <div className="flex">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move up"
                          onClick={() => move.mutate({ id: c.id, d: -1 })}
                        >
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move down"
                          onClick={() => move.mutate({ id: c.id, d: 1 })}
                        >
                          <ArrowDown className="size-3" />
                        </Button>
                      </div>
                    </td>
                    <td>
                      <p className="font-medium">
                        {c.name} {c.emergency && <Pill tone="danger">Emergency</Pill>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.role} · {c.team}
                      </p>
                    </td>
                    <td className="text-xs">
                      {c.roleIds?.length
                        ? c.roleIds
                            .map((id) => roles.find((r) => r.id === id)?.name)
                            .filter(Boolean)
                            .join(", ")
                        : "—"}
                    </td>
                    <td className="capitalize">{c.type}</td>
                    <td className="text-xs">
                      {c.phone}
                      <br />
                      {c.email}
                    </td>
                    <td className="text-xs">{c.availability}</td>
                    <td className={`text-xs ${stale ? "font-semibold text-destructive" : ""}`}>
                      {stale && <AlertTriangle className="mr-1 inline size-3" />}
                      {abs(c.lastVerifiedAt, false)}
                    </td>
                    <td className="whitespace-nowrap p-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => verify.mutate(c.id)}
                        title="Mark as verified"
                      >
                        <CheckCheck className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEdit(c)}
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            c.archived ||
                            confirm(
                              `Archive ${c.name}? Guidance linking to it will show a warning.`,
                            )
                          )
                            archive.mutate({ id: c.id, v: !c.archived });
                        }}
                        aria-label="Archive"
                      >
                        <Archive className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <ContactForm c={edit === "new" ? null : edit} all={data} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

function ContactForm({
  c,
  all,
  onClose,
}: {
  c: Contact | null;
  all: Contact[];
  onClose: () => void;
}) {
  const form = useForm<ContactInput>({
    resolver: zodResolver(ContactSchema),
    defaultValues: c
      ? (Object.fromEntries(
          Object.keys(EMPTY).map((k) => [
            k,
            c[k as keyof ContactInput] ?? EMPTY[k as keyof ContactInput],
          ]),
        ) as ContactInput)
      : EMPTY,
  });
  const { data: roles = [] } = useRoles();
  const picked = form.watch("roleIds") ?? [];
  const save = useAction((v: ContactInput) =>
    repos().contacts.save(c?.id ?? null, { ...v, roleIds: v.roleIds ?? [] }),
  );
  const e = form.formState.errors;
  const F = ({
    name,
    label,
    area,
  }: {
    name: keyof ContactInput;
    label: string;
    area?: boolean;
  }) => (
    <label className="block text-sm">
      {label}
      {area ? <Textarea {...form.register(name)} /> : <Input {...form.register(name)} />}
      {e[name] && <span className="text-xs text-destructive">{String(e[name]?.message)}</span>}
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle>{c ? `Edit ${c.name}` : "New contact"}</DialogTitle>
        </DialogHeader>
        <form
          id="cf"
          className="grid gap-3 md:grid-cols-2"
          onSubmit={form.handleSubmit(async (v) => {
            await save.mutateAsync(v);
            toast.success("Contact saved — published guidance shows the update");
            onClose();
          })}
        >
          <F name="name" label="Display name" />
          <label className="block text-sm">
            Type
            <select
              {...form.register("type")}
              className="mt-1 w-full rounded-md border bg-card p-2"
            >
              {["person", "team", "mailbox", "supplier", "external"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <F name="role" label="Role" />
          <F name="team" label="Team" />
          <F name="organization" label="Organization" />
          <F name="phone" label="Phone" />
          <F name="mobile" label="Mobile" />
          <F name="email" label="Email" />
          <F name="availability" label="Availability" />
          <F name="timezone" label="Time zone" />
          <F name="outOfHours" label="Out-of-hours instructions" />
          <F name="whenToContact" label="When to contact" />
          <label className="block text-sm">
            Backup contact
            <select
              {...form.register("backupId")}
              className="mt-1 w-full rounded-md border bg-card p-2"
            >
              <option value="">None</option>
              {all
                .filter((x) => x.id !== c?.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          <fieldset className="text-sm md:col-span-2">
            <legend className="font-medium">{t("roles.rolesField")}</legend>
            <p className="text-xs text-muted-foreground">{t("roles.rolesFieldHelp")}</p>
            <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {[...LEVELS, ""].flatMap((l, k) =>
                roles
                  .filter((r) => (r.level ?? "") === l)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((r) => (
                    <label key={r.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={picked.includes(r.id)}
                        onChange={(ev) =>
                          form.setValue(
                            "roleIds",
                            ev.target.checked
                              ? [...picked, r.id]
                              : picked.filter((x) => x !== r.id),
                            { shouldDirty: true },
                          )
                        }
                      />
                      <span>{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {l ? `${t("roles.level", { n: k + 1 })}` : ""}
                      </span>
                    </label>
                  )),
              )}
              {!roles.length && <p className="text-xs text-muted-foreground">{t("roles.none")}</p>}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("emergency")} /> Emergency contact (shown
            first)
          </label>
          <div className="md:col-span-2">
            <F name="notes" label="Internal notes" area />
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button form="cf" type="submit" disabled={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
