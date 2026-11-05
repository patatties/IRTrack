import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PortalShell } from "@/features/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { repos } from "@/data";
import { PhaseBadge } from "@/shared/components/badges";
import { both } from "@/shared/format";
import type { PhaseId } from "@/domain/types";

export const Route = createFileRoute("/track")({
  validateSearch: (s: Record<string, unknown>): { ref?: string } => ({
    ref: typeof s.ref === "string" ? s.ref : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Track a report — IRTrack" },
      {
        name: "description",
        content: "Check the status of your report with your reference number.",
      },
      { property: "og:title", content: "Track a report — IRTrack" },
      {
        property: "og:description",
        content: "Check the status of your report with your reference number.",
      },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { ref: initial } = Route.useSearch();
  const [ref, setRef] = useState(initial ?? "");
  const [res, setRes] = useState<
    { ref: string; phase: PhaseId; updatedAt: string; contact: string } | null | undefined
  >();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setRes((await repos().incidents.track(ref)) ?? null);
    setBusy(false);
  };
  return (
    <PortalShell>
      <h1 className="text-4xl font-semibold">Track a report</h1>
      <p className="mt-2 text-muted-foreground">
        Enter the reference number you received. You see only the status — never confidential
        details.
      </p>
      <form
        className="mt-4 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <label htmlFor="ref" className="sr-only">
          Reference number
        </label>
        <Input
          id="ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="e.g. IRT-DEMO-003"
          className="h-12 text-lg"
        />
        <Button type="submit" size="lg" className="h-12" disabled={!ref || busy}>
          {busy ? "Checking…" : "Check"}
        </Button>
      </form>
      {res === null && (
        <p className="mt-6 rounded-lg border p-4">
          We could not find that reference. Check the number, or call the Service Desk.
        </p>
      )}
      {res && (
        <dl className="mt-6 grid max-w-md gap-3 rounded-xl border bg-card p-5">
          <div>
            <dt className="text-sm text-muted-foreground">Reference</dt>
            <dd className="font-mono font-semibold">{res.ref}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Current phase</dt>
            <dd>
              <PhaseBadge p={res.phase} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Last update</dt>
            <dd>{both(res.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Contact</dt>
            <dd>{res.contact}</dd>
          </div>
        </dl>
      )}
    </PortalShell>
  );
}
