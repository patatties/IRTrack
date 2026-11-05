import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Printer } from "lucide-react";
import { PageHeader, Card } from "@/features/admin/ui";
import { Button } from "@/components/ui/button";
import { useDashboard, useIncidents, useSettings, useSituations } from "@/shared/hooks";
import { latestVersion } from "@/domain/rules";
import { abs } from "@/shared/format";
import { t } from "@/i18n";
import { DOMAINS, type DomainId } from "@/domain/types";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "Reports — IRTrack" },
      { name: "description", content: "Ready-made, print-friendly incident reports." },
      { property: "og:title", content: "Reports — IRTrack" },
      { property: "og:description", content: "Ready-made, print-friendly incident reports." },
    ],
  }),
  component: Reports,
});

const REPORTS = [
  "Monthly overview",
  "Executive summary",
  "Post-incident reviews",
  "Reporting obligations",
  "Recurring problems",
  "Guidance review status",
] as const;

function Reports() {
  const { data: settings } = useSettings();
  const [r, setR] = useState<(typeof REPORTS)[number]>("Monthly overview");
  const [domain, setDomain] = useState<DomainId | "">("");
  const { data: d } = useDashboard({
    days: 30,
    domain: domain || undefined,
    ctx: r === "Executive summary" ? "executive" : "admin",
  });
  const { data: inc } = useIncidents({
    pageSize: 200,
    minSeverity: 3,
    domain: domain || undefined,
    ctx: "executive",
  });
  const { data: sits = [] } = useSituations();
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Pick a report, filter it, and print or save as PDF."
        actions={
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        }
      />
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {REPORTS.map((x) => (
          <Button
            key={x}
            size="sm"
            variant={r === x ? "default" : "outline"}
            onClick={() => setR(x)}
          >
            {x}
          </Button>
        ))}
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as DomainId)}
          className="rounded-md border bg-card px-2 text-sm"
          aria-label="Domain"
        >
          <option value="">All domains</option>
          {DOMAINS.map((x) => (
            <option key={x} value={x}>
              {t(`domain.${x}`)}
            </option>
          ))}
        </select>
      </div>
      <Card
        title={r}
        takeaway={`${settings?.organization.name ?? ""} · generated ${abs(new Date().toISOString())}`}
      >
        {(r === "Monthly overview" || r === "Executive summary") && d && (
          <div className="space-y-3 text-sm">
            <p className="text-lg">
              {d.summary.serious} serious incidents active, {d.summary.open} open in total.
            </p>
            <table className="w-full">
              <tbody>
                {d.kpis.map((k) => (
                  <tr key={k.key} className="border-t">
                    <td className="py-1">{t(`admin.kpi.${k.key}`)}</td>
                    <td className="font-mono">
                      {k.value}
                      {k.unit}
                    </td>
                    <td className="text-muted-foreground">
                      prev. {k.previous}
                      {k.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r === "Post-incident reviews" && (
          <ul className="space-y-2 text-sm">
            {inc?.items
              .filter((i) => i.actions.length)
              .map((i) => (
                <li key={i.id} className="border-t pt-2">
                  <p className="font-semibold">
                    {i.ref} — {i.title}
                  </p>
                  {i.actions.map((a) => (
                    <p key={a.id}>
                      • {a.title} ({a.owner}, {a.done ? "done" : "open"})
                    </p>
                  ))}
                </li>
              ))}
          </ul>
        )}
        {r === "Reporting obligations" && (
          <ul className="text-sm">
            {inc?.items.flatMap((i) =>
              i.deadlines.map((dl) => (
                <li key={i.id + dl.id} className="border-t py-1">
                  {i.ref} · {dl.ruleName} · {dl.stage} · due {abs(dl.dueAt)} · {dl.status}
                </li>
              )),
            )}
          </ul>
        )}
        {r === "Recurring problems" && d && (
          <ul className="text-sm">
            {d.topCategories.map((c) => (
              <li key={c.name} className="border-t py-1">
                {c.name}: {c.count} incidents in 30 days
              </li>
            ))}
          </ul>
        )}
        {r === "Guidance review status" && (
          <ul className="text-sm">
            {sits.map((s) => {
              const v = latestVersion(s);
              const od = new Date(v.content.reviewDate) < new Date();
              return (
                <li key={s.id} className="border-t py-1">
                  {v.content.title} — review {abs(v.content.reviewDate, false)}{" "}
                  {od && <strong className="text-destructive">(overdue)</strong>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
