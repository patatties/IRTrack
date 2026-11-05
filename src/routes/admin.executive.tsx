import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { DashboardView } from "@/features/admin/Dashboard";
import { PageHeader } from "@/features/admin/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/executive")({
  head: () => ({
    meta: [
      { title: "Executive view — IRTrack" },
      {
        name: "description",
        content: "High-level incident summary for management, exportable to PDF.",
      },
      { property: "og:title", content: "Executive view — IRTrack" },
      { property: "og:description", content: "High-level incident summary for management." },
    ],
  }),
  component: () => (
    <div>
      <PageHeader
        title="Executive view"
        description="The essentials for management. Confidential incidents appear only as numbers."
        actions={
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Export to PDF
          </Button>
        }
      />
      <DashboardView ctx="executive" compact />
    </div>
  ),
});
