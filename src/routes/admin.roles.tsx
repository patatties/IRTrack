import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Card } from "@/features/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAction, useContacts, useProcesses, useRaci, useRoles } from "@/shared/hooks";
import { RaciMatrix } from "@/shared/components/RaciMatrix";
import { RoleDetail } from "@/shared/flow/FlowchartViewer";
import { contactsOf, RoleContacts } from "@/shared/components/RoleLadder";
import { repos } from "@/data";
import { LEVELS, type Role } from "@/domain/types";
import { t } from "@/i18n";
import { currentActor } from "@/auth/actor";

import { TemplateButton } from "@/shared/components/TemplatePicker";
export const Route = createFileRoute("/admin/roles")({
  head: () => ({
    meta: [
      { title: "Roles & RACI — IRTrack" },
      {
        name: "description",
        content: "Define roles, responsibilities and the RACI matrix per process.",
      },
      { property: "og:title", content: "Roles & RACI — IRTrack" },
      { property: "og:description", content: "Define roles, responsibilities and RACI." },
    ],
  }),
  component: RolesAdmin,
});

function RolesAdmin() {
  const { data: roles = [] } = useRoles();
  const { data: contacts = [] } = useContacts();
  const { data: processes = [] } = useProcesses();
  const [picked, setPid] = useState("");
  const pid = picked || processes[0]?.id || "";
  const { data: raci = [] } = useRaci(pid || undefined);
  const [sel, setSel] = useState<Role | null>(null);
  const save = useAction((r: Role) => repos().roles.save(r));
  const setRaci = useAction((a: Parameters<ReturnType<typeof repos>["roles"]["setRaci"]>[0]) =>
    repos().roles.setRaci(a),
  );
  const p = processes.find((x) => x.id === pid);
  return (
    <div>
      <PageHeader
        title="Roles & responsibilities"
        description="Roles, what they decide, and the RACI per process and phase. Click a RACI cell to change it."
      />
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card title="Roles">
          {[...LEVELS, ""].map((l, k) => {
            const xs = roles
              .filter((r) => (r.level ?? "") === l)
              .sort((a, b) => a.name.localeCompare(b.name));
            if (!xs.length) return null;
            return (
              <div key={l || "none"} className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  {l
                    ? `${t("roles.level", { n: k + 1 })} · ${t(`level.${l}`)}`
                    : t("roles.noLevel")}
                </p>
                <ul className="space-y-1">
                  {xs.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => setSel(structuredClone(r))}
                        className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${sel?.id === r.id ? "bg-muted font-semibold" : ""}`}
                      >
                        {r.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full"
            onClick={() =>
              setSel({
                id: `r-${crypto.randomUUID().slice(0, 6)}`,
                name: "New role",
                summary: "",
                responsibilities: [],
                skills: [],
                decides: [],
                contactIds: [],
                onEscalation: "",
                createdAt: new Date().toISOString(),
                createdBy: currentActor().name,
                updatedAt: new Date().toISOString(),
                updatedBy: currentActor().name,
              })
            }
          >
            + New role
          </Button>
          <div className="mt-2">
            <TemplateButton kind="roles" size="sm" />
          </div>
        </Card>
        <div className="space-y-4">
          {sel && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={`Edit: ${sel.name}`}>
                <div className="space-y-2 text-sm">
                  <label className="block">
                    Name
                    <Input
                      value={sel.name}
                      onChange={(e) => setSel({ ...sel, name: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    Summary
                    <Input
                      value={sel.summary}
                      onChange={(e) => setSel({ ...sel, summary: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    {t("roles.field")}
                    <select
                      className="mt-1 w-full rounded-md border bg-card p-2"
                      value={sel.level ?? ""}
                      onChange={(e) => setSel({ ...sel, level: e.target.value as Role["level"] })}
                    >
                      <option value="">{t("roles.noLevel")}</option>
                      {LEVELS.map((l, k) => (
                        <option key={l} value={l}>
                          {t("roles.level", { n: k + 1 })} · {t(`level.${l}`)}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">{t("roles.fieldHelp")}</span>
                  </label>
                  <label className="block">
                    Responsibilities (one per line)
                    <Textarea
                      value={sel.responsibilities.join("\n")}
                      onChange={(e) =>
                        setSel({ ...sel, responsibilities: e.target.value.split("\n") })
                      }
                    />
                  </label>
                  <label className="block">
                    Decides (one per line)
                    <Textarea
                      value={sel.decides.join("\n")}
                      onChange={(e) => setSel({ ...sel, decides: e.target.value.split("\n") })}
                    />
                  </label>
                  <label className="block">
                    Required skills (comma separated)
                    <Input
                      value={sel.skills.join(", ")}
                      onChange={(e) =>
                        setSel({ ...sel, skills: e.target.value.split(",").map((x) => x.trim()) })
                      }
                    />
                  </label>
                  <label className="block">
                    What changes after escalation
                    <Input
                      value={sel.onEscalation}
                      onChange={(e) => setSel({ ...sel, onEscalation: e.target.value })}
                    />
                  </label>
                  <div>
                    <p className="font-medium">{t("roles.contacts")}</p>
                    <RoleContacts contacts={contactsOf(sel, contacts)} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("roles.contactsManaged")}{" "}
                      <Link to="/admin/contacts" className="text-primary underline">
                        {t("admin.nav.contacts")}
                      </Link>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setSel(null)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        await save.mutateAsync({
                          ...sel,
                          responsibilities: sel.responsibilities.filter(Boolean),
                          decides: sel.decides.filter(Boolean),
                        });
                        toast.success("Role saved");
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </Card>
              <Card title="Preview: user-facing role card">
                <RoleDetail r={sel} />
              </Card>
            </div>
          )}
          <Card
            title="RACI matrix"
            actions={
              <select
                value={pid}
                onChange={(e) => setPid(e.target.value)}
                className="rounded-md border bg-card p-1 text-sm"
                aria-label="Process"
              >
                {processes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            }
          >
            {p && (
              <RaciMatrix
                roles={roles}
                raci={raci}
                roleIds={p.roleIds}
                onChange={(a) => setRaci.mutate(a)}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
