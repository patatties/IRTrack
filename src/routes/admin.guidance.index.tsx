import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useSituations } from "@/shared/hooks";
import { PageHeader } from "@/features/admin/ui";
import { latestVersion, publishedVersion } from "@/domain/rules";
import { abs } from "@/shared/format";
import { Pill } from "@/shared/components/badges";
import { SituationIcon } from "@/shared/components/SituationIcon";

import { TemplateButton } from "@/shared/components/TemplatePicker";
export const Route = createFileRoute("/admin/guidance/")({
  head: () => ({
    meta: [
      { title: "Guidance — IRTrack" },
      { name: "description", content: "Manage situations, flowcharts and publishing." },
      { property: "og:title", content: "Guidance — IRTrack" },
      { property: "og:description", content: "Manage situations, flowcharts and publishing." },
    ],
  }),
  component: GuidanceList,
});

function GuidanceList() {
  const { data = [] } = useSituations();
  return (
    <div>
      <PageHeader
        title="Guidance"
        description="Everything employees see in the User Portal. Only published versions are visible there."
        actions={<TemplateButton kind="guidance" />}
      />
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Situation</th>
              <th>Published</th>
              <th>Latest</th>
              <th>Owner</th>
              <th>Review date</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => {
              const l = latestVersion(s);
              const p = publishedVersion(s);
              const overdue = new Date(l.content.reviewDate) < new Date();
              return (
                <tr key={s.id} className="border-t hover:bg-muted/40">
                  <td className="p-3">
                    <Link
                      to="/admin/guidance/$id"
                      params={{ id: s.id }}
                      className="flex items-center gap-2 font-medium text-primary underline"
                    >
                      <SituationIcon name={l.content.icon} className="size-4" /> {l.content.title}
                    </Link>
                  </td>
                  <td>{p ? `v${p.version}` : "—"}</td>
                  <td>
                    <Pill
                      tone={
                        l.status === "published"
                          ? "primary"
                          : l.status === "review"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      v{l.version} · {l.status}
                    </Pill>
                  </td>
                  <td>{l.content.owner}</td>
                  <td className={overdue ? "font-semibold text-destructive" : ""}>
                    {overdue && <AlertTriangle className="mr-1 inline size-3" />}
                    {abs(l.content.reviewDate, false)}
                    {overdue && " · overdue"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
