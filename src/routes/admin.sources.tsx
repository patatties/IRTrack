import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Copy } from "lucide-react";
import { PageHeader, Card } from "@/features/admin/ui";
import { Button } from "@/components/ui/button";
import { useAction, useSources } from "@/shared/hooks";
import { repos } from "@/data";
import type { SourceId } from "@/domain/types";
import { Pill } from "@/shared/components/badges";
import { both, rel } from "@/shared/format";

import { TemplateButton } from "@/shared/components/TemplatePicker";
export const Route = createFileRoute("/admin/sources")({
  head: () => ({
    meta: [
      { title: "Sources & imports — IRTrack" },
      { name: "description", content: "Connect TOPdesk, ServiceNow, Jira, CSV and webhooks." },
      { property: "og:title", content: "Sources & imports — IRTrack" },
      { property: "og:description", content: "Connect service desks and other sources." },
    ],
  }),
  component: Sources,
});

function Sources() {
  const { data = [] } = useSources();
  const [sel, setSel] = useState<SourceId>("topdesk");
  const s = data.find((x) => x.id === sel);
  const { data: preview = [], isFetching } = useQuery({
    queryKey: ["preview", sel],
    queryFn: () => repos().sources.preview(sel),
  });
  const run = useAction(() => repos().sources.runImport(sel));
  return (
    <div>
      <PageHeader
        title="Sources & imports"
        description="IRTrack takes in the full incident flow from your service desks. Connectors are not available yet; mappings can be prepared."
        actions={<TemplateButton kind="sources" />}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        {data.map((x) => (
          <button
            key={x.id}
            onClick={() => setSel(x.id)}
            className={`rounded-xl border bg-card p-4 text-left shadow-card ${sel === x.id ? "border-primary ring-2 ring-primary/30" : ""}`}
          >
            <p className="font-semibold">{x.name}</p>
            <Pill
              tone={
                x.status === "connected" ? "primary" : x.status === "warning" ? "warn" : "danger"
              }
            >
              {x.status}
            </Pill>
            <p className="mt-1 text-xs text-muted-foreground">Last sync {rel(x.lastSyncAt)}</p>
          </button>
        ))}
      </div>
      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Field mapping"
            takeaway="Source fields stay identifiable as source information."
          >
            <ul className="space-y-1 text-sm">
              {s.fieldMap.map((m) => (
                <li key={m.from} className="flex items-center gap-2">
                  <code className="rounded bg-muted px-1">{m.from}</code>
                  <ArrowRight className="size-3" />
                  <span className="font-medium">{m.to}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Value mapping">
            <table className="w-full text-sm">
              <tbody>
                {s.valueMap.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 text-muted-foreground">{m.field}</td>
                    <td>
                      <code>{m.from}</code>
                    </td>
                    <td>→ {m.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card
            title="Import preview"
            takeaway="Duplicates are detected using source + source ID."
            className="lg:col-span-2"
            actions={
              <Button
                disabled={run.isPending}
                onClick={async () => {
                  const r = await run.mutateAsync(undefined);
                  toast.success(`Imported ${r.imported}, skipped ${r.duplicates} duplicates`);
                }}
              >
                {run.isPending ? "Importing…" : "Run import"}
              </Button>
            }
          >
            {isFetching ? (
              <p role="status">Loading preview…</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1">Source ID</th>
                    <th>Title</th>
                    <th>Mapped severity</th>
                    <th>Location</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.row.number} className="border-t">
                      <td className="py-2 font-mono text-xs">{p.row.number}</td>
                      <td>{p.mapped.title}</td>
                      <td>{p.mapped.severity}</td>
                      <td>{p.mapped.location}</td>
                      <td>
                        {p.duplicateOf ? (
                          <Pill tone="warn">
                            <Copy className="size-3" /> Duplicate of {p.duplicateOf}
                          </Pill>
                        ) : (
                          <Pill tone="primary">New</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Error log" className="lg:col-span-2">
            {s.errors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No errors.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {s.errors.map((e, i) => (
                  <li key={i}>
                    <span className="text-xs text-muted-foreground">{both(e.at)}</span> —{" "}
                    {e.message}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
