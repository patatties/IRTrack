import { createFileRoute } from "@tanstack/react-router";
import { GLOSSARY } from "@/features/admin/glossary";
import { PageHeader } from "@/features/admin/ui";

export const Route = createFileRoute("/admin/glossary")({
  head: () => ({
    meta: [
      { title: "Glossary — IRTrack" },
      { name: "description", content: "Plain-language explanations of incident response terms." },
      { property: "og:title", content: "Glossary — IRTrack" },
      {
        property: "og:description",
        content: "Plain-language explanations of incident response terms.",
      },
    ],
  }),
  component: () => (
    <div>
      <PageHeader
        title="Glossary"
        description="Every term used in IRTrack, explained in plain language."
      />
      <dl className="grid gap-3 md:grid-cols-2">
        {Object.entries(GLOSSARY).map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-4">
            <dt className="font-semibold">{k}</dt>
            <dd className="mt-1 text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  ),
});
