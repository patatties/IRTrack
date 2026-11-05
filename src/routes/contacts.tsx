import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { PortalShell } from "@/features/portal/PortalShell";
import { ContactCard } from "@/shared/components/ContactCard";
import { useContacts, useRoles, useSettings } from "@/shared/hooks";
import { RoleLadder } from "@/shared/components/RoleLadder";
import type { Contact } from "@/domain/types";
import { t } from "@/i18n";

export const Route = createFileRoute("/contacts")({
  head: () => ({
    meta: [
      { title: "Who do I call? — IRTrack" },
      {
        name: "description",
        content: "Emergency, out-of-hours and specialist contacts for every kind of incident.",
      },
      { property: "og:title", content: "Who do I call? — IRTrack" },
      { property: "og:description", content: "Emergency, out-of-hours and specialist contacts." },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useContacts({ search: q });
  const { data: s } = useSettings();
  const all = useContacts().data ?? [];
  const { data: roles = [] } = useRoles();
  const searching = q.trim().length > 0;
  const card = (c: Contact) => (
    <ContactCard
      c={c}
      backup={all.find((b) => b.id === c.backupId)}
      verifyDays={s?.portal.contactVerificationDays}
    />
  );
  return (
    <PortalShell>
      <h1 className="text-4xl font-semibold">Who do I call?</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        {t("contacts.ladder.intro")} Tap a number to call.
      </p>
      <label className="mt-4 flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <Search className="size-5 text-muted-foreground" />
        <span className="sr-only">Search contacts</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, team or situation"
          className="w-full bg-transparent py-1 outline-none"
        />
      </label>
      {isLoading && (
        <p role="status" className="mt-4">
          Loading contacts…
        </p>
      )}
      {searching ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {data.map((c) => (
            <div key={c.id}>{card(c)}</div>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <h2 className="mb-3 text-xl font-semibold">{t("contacts.ladder.title")}</h2>
          <RoleLadder
            roles={roles}
            contacts={data}
            renderContact={card}
            renderRole={(r, cs) => (
              <div className="space-y-2">
                <p className="font-semibold">
                  {r.name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">· {r.summary}</span>
                </p>
                {cs.length ? (
                  cs.map((c) => <div key={c.id}>{card(c)}</div>)
                ) : (
                  <p className="text-sm text-muted-foreground">{t("roles.noContacts")}</p>
                )}
              </div>
            )}
          />
        </div>
      )}
      {!isLoading && data.length === 0 && <p className="mt-4">No contacts match “{q}”.</p>}
    </PortalShell>
  );
}
