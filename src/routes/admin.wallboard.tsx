import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { DashboardView } from "@/features/admin/Dashboard";
import { abs } from "@/shared/format";

export const Route = createFileRoute("/admin/wallboard")({
  head: () => ({
    meta: [
      { title: "Wallboard — IRTrack" },
      { name: "description", content: "Full-screen incident overview for the control room." },
      { property: "og:title", content: "Wallboard — IRTrack" },
      {
        property: "og:description",
        content: "Full-screen incident overview for the control room.",
      },
    ],
  }),
  component: Wallboard,
});

function Wallboard() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30000);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      clearInterval(i);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-2xl font-semibold">IRTrack · Control room</p>
        <div className="flex items-center gap-4">
          <span className="font-mono text-lg">{abs(now.toISOString())}</span>
          <Link to="/admin" className="rounded-md border p-2" aria-label="Exit wallboard">
            <X className="size-5" />
          </Link>
        </div>
      </div>
      <DashboardView ctx="wallboard" compact />
    </div>
  );
}
