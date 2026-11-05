import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { useContacts, useSettings, useSituations } from "@/shared/hooks";
import { publishedVersion } from "@/domain/rules";
import { abs } from "@/shared/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/print")({
  head: () => ({
    meta: [
      { title: "Emergency guidance pack — IRTrack" },
      {
        name: "description",
        content:
          "All published incident guidance on paper, for when digital systems are unavailable.",
      },
      { property: "og:title", content: "Emergency guidance pack — IRTrack" },
      { property: "og:description", content: "All published incident guidance on paper." },
    ],
  }),
  component: PrintPack,
});

function PrintPack() {
  const { data: settings } = useSettings();
  const { data: sits = [] } = useSituations();
  const { data: contacts = [] } = useContacts();
  const items = sits.map((s) => publishedVersion(s)).filter(Boolean);
  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="no-print mb-6 flex items-center justify-between rounded-lg bg-primary-soft p-4">
        <p>Use your browser's print dialog and choose “Save as PDF”.</p>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save PDF
        </Button>
      </div>
      <h1 className="text-3xl font-semibold">Emergency guidance pack</h1>
      <p className="text-muted-foreground">
        {settings?.organization.name} · generated {abs(new Date().toISOString())}
      </p>
      <section className="mt-6 break-after-page">
        <h2 className="text-xl font-semibold">Emergency contacts</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {contacts
              .filter((c) => c.emergency)
              .map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="py-1 font-medium">{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.availability}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      {items.map((v) => (
        <section key={v!.content.title} className="mt-8 break-inside-avoid border-t pt-4">
          <h2 className="text-xl font-semibold">{v!.content.title}</h2>
          <p className="font-semibold">Do this first</p>
          <ol className="list-decimal pl-5">
            {v!.content.doFirst.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
          <p className="mt-2 font-semibold">Do not</p>
          <ul className="list-disc pl-5">
            {v!.content.dont.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            Contact:{" "}
            {v!.content.contactIds
              .map((id) => contacts.find((c) => c.id === id))
              .filter(Boolean)
              .map((c) => `${c!.name} ${c!.phone}`)
              .join(" · ")}
          </p>
        </section>
      ))}
    </div>
  );
}
