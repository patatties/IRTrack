import { createFileRoute, Link } from "@tanstack/react-router";
import { Maximize2, Presentation } from "lucide-react";
import { DashboardView } from "@/features/admin/Dashboard";
import { PageHeader } from "@/features/admin/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — IRTrack" },
      { name: "description", content: "The full incident flow from all sources and domains." },
      { property: "og:title", content: "Dashboard — IRTrack" },
      {
        property: "og:description",
        content: "The full incident flow from all sources and domains.",
      },
    ],
  }),
  component: () => (
    <div>
      <PageHeader
        title="Dashboard"
        description="Every incident from every source and domain. Click any number or chart to see the incidents behind it."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/admin/executive">
                <Presentation className="size-4" /> Executive view
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/wallboard">
                <Maximize2 className="size-4" /> Wallboard
              </Link>
            </Button>
          </>
        }
      />
      <DashboardView ctx="admin" />
    </div>
  ),
});
