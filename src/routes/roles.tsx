import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PortalShell } from "@/features/portal/PortalShell";
import { useContacts, useProcesses, useRaci, useRoles } from "@/shared/hooks";
import { RoleDetail } from "@/shared/flow/FlowchartViewer";
import { RaciMatrix } from "@/shared/components/RaciMatrix";
import { ContactCard } from "@/shared/components/ContactCard";
import { LevelFlow, RoleContacts, RoleLadder } from "@/shared/components/RoleLadder";
import { t } from "@/i18n";

export const Route = createFileRoute("/roles")({
  head: () => ({
    meta: [
      { title: "Who does what — IRTrack" },
      {
        name: "description",
        content:
          "Roles per escalation level, with who fills them: who does the work, who decides, and who takes over when an incident grows.",
      },
      { property: "og:title", content: "Who does what — IRTrack" },
      { property: "og:description", content: "Roles per escalation level, in plain language." },
    ],
  }),
  component: RolesPage,
});

function RolesPage() {
  const { data: roles = [], isLoading } = useRoles();
  const { data: contacts = [] } = useContacts();
  const { data: processes = [] } = useProcesses();
  const [picked, setPicked] = useState("");
  const pid =
    picked ||
    (processes.some((x) => x.id === "p-security") ? "p-security" : processes[0]?.id) ||
    "";
  const process = processes.find((x) => x.id === pid);

  return (
    <PortalShell>
      <h1 className="text-4xl font-semibold">Who does what</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">{t("roles.intro")}</p>
      {isLoading && (
        <p role="status" className="mt-4">
          {t("common.loading")}
        </p>
      )}

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">{t("roles.flowTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("roles.flowHelp")}</p>
          </div>
          {processes.length > 0 && (
            <label className="text-sm">
              <span className="sr-only">{t("roles.process")}</span>
              <select
                value={pid}
                onChange={(e) => setPicked(e.target.value)}
                className="rounded-md border bg-card px-3 py-2"
              >
                {processes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <LevelFlow process={process} />
        {process?.alias && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("csirt")} {t("cert")}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-semibold">{t("roles.ladderTitle")}</h2>
        <RoleLadder
          roles={roles}
          contacts={contacts}
          process={process}
          emptyLevel={<p className="text-sm text-muted-foreground">{t("roles.none")}</p>}
          renderRole={(r, cs) => (
            <div className="h-full rounded-xl border bg-card p-4 shadow-card">
              <RoleDetail r={r} />
              <div className="mt-3 border-t pt-2">
                <p className="mb-1 text-sm font-semibold">{t("roles.contacts")}</p>
                <RoleContacts contacts={cs} />
              </div>
            </div>
          )}
          renderContact={(c) => <ContactCard c={c} />}
        />
      </section>

      <ProcessRaci pid={pid} />
    </PortalShell>
  );
}

/** Responsibilities per phase for the chosen process: kept for detail, collapsed by default. */
function ProcessRaci({ pid }: { pid: string }) {
  const { data: processes = [] } = useProcesses();
  const { data: roles = [] } = useRoles();
  const { data: raci = [] } = useRaci(pid || undefined);
  const p = processes.find((x) => x.id === pid);
  if (!p) return null;
  return (
    <details className="mt-8 rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold">
        {t("roles.raciTitle")} · {p.name}
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">{t("roles.raciHelp")}</p>
      <div className="mt-4">
        <RaciMatrix roles={roles} raci={raci} roleIds={p.roleIds} />
      </div>
    </details>
  );
}
