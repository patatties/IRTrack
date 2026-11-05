import { Link } from "@tanstack/react-router";
import { CheckCircle2, Eye, FileText, Printer, XCircle, ArrowRight, Info } from "lucide-react";
import type { Contact, GuidanceContent, Role } from "@/domain/types";
import { FlowchartViewer, RoleDetail } from "@/shared/flow/FlowchartViewer";
import { ContactCard } from "@/shared/components/ContactCard";
import { SituationIcon } from "@/shared/components/SituationIcon";
import { abs } from "@/shared/format";
import { t } from "@/i18n";

export function SituationGuidance({
  slug,
  c,
  contacts,
  roles,
  preview,
  forceMode,
}: {
  slug: string;
  c: GuidanceContent;
  contacts: Contact[];
  roles: Role[];
  preview?: boolean;
  forceMode?: "desktop" | "mobile";
}) {
  const linked = c.contactIds
    .map((id) => contacts.find((x) => x.id === id))
    .filter(Boolean) as Contact[];
  const linkedRoles = c.roleIds
    .map((id) => roles.find((x) => x.id === id))
    .filter(Boolean) as Role[];
  const isSecurity = c.domains.includes("security");
  return (
    <article className="space-y-8">
      <header className="flex gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <SituationIcon name={c.icon} className="size-7" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{c.category}</p>
          <h1 className="text-3xl font-semibold md:text-4xl">{c.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{c.description}</p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border-2 border-primary bg-card p-5 md:row-span-2">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <CheckCircle2 className="size-5 text-primary" /> {t("portal.doFirst")}
          </h2>
          <ol className="mt-3 space-y-3">
            {c.doFirst.map((x, i) => (
              <li key={x} className="flex gap-3 text-lg">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary font-mono text-sm text-primary-foreground">
                  {i + 1}
                </span>
                {x}
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <XCircle className="size-5" /> {t("portal.dont")}
          </h2>
          <ul className="mt-2 space-y-1">
            {c.dont.map((x) => (
              <li key={x}>✕ {x}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border bg-muted/50 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Eye className="size-5" /> {t("portal.see")}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {c.see.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="no-print">
        <h2 className="mb-3 text-2xl font-semibold">{t("portal.flow")}</h2>
        <FlowchartViewer
          flowchart={c.flowchart}
          contacts={contacts}
          roles={roles}
          reportSituation={preview ? undefined : slug}
          forceMode={forceMode}
        />
      </section>

      <section>
        <h2 className="mb-3 text-2xl font-semibold">{t("portal.contactNow")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {linked.map((x) => (
            <ContactCard key={x.id} c={x} backup={contacts.find((b) => b.id === x.backupId)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-2xl font-semibold">{t("portal.rolesHere")}</h2>
        {isSecurity && (
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4" /> {t("csirt")} {t("cert")}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {linkedRoles.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-4">
              <RoleDetail r={r} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-primary-soft p-5">
        <h2 className="text-xl font-semibold">{t("portal.next")}</h2>
        <ol className="mt-3 space-y-2">
          {c.next.map((x) => (
            <li key={x} className="flex gap-2">
              <ArrowRight className="mt-1 size-4 shrink-0" /> {x}
            </li>
          ))}
        </ol>
        {!preview && (
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <Link
              to="/report"
              search={{ situation: slug }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground"
            >
              <FileText className="size-4" /> {t("portal.reportThis")}
            </Link>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md border bg-card px-4 py-3 font-semibold"
            >
              <Printer className="size-4" /> {t("portal.printCard")}
            </button>
          </div>
        )}
      </section>

      <footer className="text-sm text-muted-foreground">
        Content owner: {c.owner} · {t("common.lastReviewed")}: {abs(c.reviewDate, false)}
      </footer>
    </article>
  );
}
