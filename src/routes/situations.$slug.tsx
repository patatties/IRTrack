import { createFileRoute, Link } from "@tanstack/react-router";
import { PortalShell } from "@/features/portal/PortalShell";
import { SituationGuidance } from "@/features/portal/SituationGuidance";
import { useContacts, useRoles, useSituation } from "@/shared/hooks";
import { publishedVersion } from "@/domain/rules";

export const Route = createFileRoute("/situations/$slug")({
  head: () => ({
    meta: [
      { title: "Situation guidance — IRTrack" },
      {
        name: "description",
        content: "Step-by-step guidance: what to do first, what not to do, and who to contact.",
      },
      { property: "og:title", content: "Situation guidance — IRTrack" },
      {
        property: "og:description",
        content: "Step-by-step guidance: what to do first, what not to do, and who to contact.",
      },
    ],
  }),
  component: SituationPage,
});

function SituationPage() {
  const { slug } = Route.useParams();
  const { data: s, isLoading } = useSituation(slug);
  const { data: contacts = [] } = useContacts();
  const { data: roles = [] } = useRoles();
  const v = s ? publishedVersion(s) : undefined;
  return (
    <PortalShell>
      <Link to="/" className="no-print mb-4 inline-block text-sm text-primary underline">
        ← All situations
      </Link>
      {isLoading ? (
        <p role="status">Loading guidance…</p>
      ) : !v ? (
        <p>This guidance is not published.</p>
      ) : (
        <SituationGuidance slug={slug} c={v.content} contacts={contacts} roles={roles} />
      )}
    </PortalShell>
  );
}
