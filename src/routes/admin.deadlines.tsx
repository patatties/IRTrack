import { createFileRoute, Link } from "@tanstack/react-router";
import { useIncidents } from "@/shared/hooks";
import { PageHeader, Card, Empty } from "@/features/admin/ui";
import { abs, countdown } from "@/shared/format";
import { Pill, SeverityBadge } from "@/shared/components/badges";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/deadlines")({
  head: () => ({
    meta: [
      { title: "Reporting obligations — IRTrack" },
      { name: "description", content: "All active reporting deadlines with countdowns." },
      { property: "og:title", content: "Reporting obligations — IRTrack" },
      { property: "og:description", content: "All active reporting deadlines with countdowns." },
    ],
  }),
  component: Deadlines,
});

function Deadlines() {
  const { data } = useIncidents({ open: true, pageSize: 1000 });
  const rows = (data?.items ?? [])
    .flatMap((i) => i.deadlines.map((d) => ({ i, d })))
    .sort((a, b) => a.d.dueAt.localeCompare(b.d.dueAt));
  return (
    <div>
      <PageHeader
        title="Reporting obligations"
        description="Every active deadline across all incidents. Rules come from Settings → Reporting deadlines."
      />
      <p className="mb-4 rounded-lg border-l-4 border-warning bg-accent p-3 text-sm">
        {t("admin.legal")}
      </p>
      <Card>
        {rows.length === 0 ? (
          <Empty>No active deadlines.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Incident</th>
                <th>Rule</th>
                <th>Stage</th>
                <th>Due</th>
                <th>Countdown</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Draft report</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ i, d }) => {
                const c = countdown(d.dueAt);
                const st =
                  d.status === "submitted"
                    ? "Submitted"
                    : c.overdue
                      ? "Overdue"
                      : c.hours < 12
                        ? "Due soon"
                        : "Open";
                return (
                  <tr key={i.id + d.id} className="border-t">
                    <td className="p-2">
                      <Link
                        to="/admin/incidents/$id"
                        params={{ id: i.id }}
                        className="text-primary underline"
                      >
                        {i.ref}
                      </Link>
                      <div className="text-xs">{i.title}</div>
                      <SeverityBadge s={i.severity} />
                    </td>
                    <td>
                      {d.ruleName}{" "}
                      <span className="text-xs text-muted-foreground">v{d.ruleVersion}</span>
                    </td>
                    <td>{d.stage}</td>
                    <td>{abs(d.dueAt)}</td>
                    <td
                      className={cn(
                        "font-mono",
                        c.overdue && d.status !== "submitted" && "font-semibold text-destructive",
                      )}
                    >
                      {d.status === "submitted" ? "—" : c.text}
                    </td>
                    <td>{d.ownerRole.replace("r-", "")}</td>
                    <td>
                      <Pill
                        tone={
                          st === "Overdue"
                            ? "danger"
                            : st === "Due soon"
                              ? "warn"
                              : st === "Submitted"
                                ? "primary"
                                : "neutral"
                        }
                      >
                        {st}
                      </Pill>
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {d.draft || (
                        <Link to="/admin/incidents/$id" params={{ id: i.id }} className="underline">
                          Start draft
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
