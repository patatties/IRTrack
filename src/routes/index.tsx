import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, FileText, Phone, Search, Users, Printer } from "lucide-react";
import { PortalShell } from "@/features/portal/PortalShell";
import { useSettings, useSituations } from "@/shared/hooks";
import { publishedVersion } from "@/domain/rules";
import { searchSituations } from "@/features/portal/search";
import { SituationIcon } from "@/shared/components/SituationIcon";
import { t } from "@/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "What are you seeing? — IRTrack" },
      {
        name: "description",
        content: "Find out what to do, who to contact and how to report an incident.",
      },
      { property: "og:title", content: "What are you seeing? — IRTrack" },
      {
        property: "og:description",
        content: "Clear first steps, contacts and reporting for every kind of incident.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: sits = [] } = useSituations();
  const { data: settings } = useSettings();
  const [q, setQ] = useState("");
  const published = useMemo(
    () =>
      sits.map((s) => ({ s, content: publishedVersion(s)?.content })).filter((x) => x.content) as {
        s: (typeof sits)[number];
        content: NonNullable<ReturnType<typeof publishedVersion>>["content"];
      }[],
    [sits],
  );
  const results = useMemo(() => (q ? searchSituations(published, q) : published), [published, q]);
  const featured = settings?.portal.featured ?? [];
  const ordered = q
    ? results
    : [...results].sort(
        (a, b) => Number(featured.includes(b.s.id)) - Number(featured.includes(a.s.id)),
      );

  return (
    <PortalShell>
      <section className="bg-hero -mx-4 -mt-6 px-4 pb-8 pt-10 md:-mt-10 md:rounded-b-3xl md:pt-16">
        <p className="text-sm font-medium text-primary">{settings?.portal.welcome}</p>
        <h1 className="mt-2 text-4xl font-semibold md:text-6xl">{t("portal.question")}</h1>
        <label className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-primary/30 bg-card px-4 py-3 shadow-card focus-within:border-primary">
          <Search className="size-6 text-muted-foreground" aria-hidden />
          <span className="sr-only">Describe what you see</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("portal.searchPlaceholder")}
            className="w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Link
            to="/report"
            search={{}}
            className="flex items-center gap-3 rounded-xl bg-primary p-4 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <FileText className="size-5" /> {t("portal.report")}{" "}
            <ArrowRight className="ml-auto size-4" />
          </Link>
          <Link
            to="/contacts"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 font-semibold hover:bg-muted"
          >
            <Phone className="size-5" /> {t("portal.whoToCall")}{" "}
            <ArrowRight className="ml-auto size-4" />
          </Link>
          <Link
            to="/roles"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 font-semibold hover:bg-muted"
          >
            <Users className="size-5" /> {t("portal.roles")}{" "}
            <ArrowRight className="ml-auto size-4" />
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold">
            {q ? `Matches for “${q}”` : t("portal.common")}
          </h2>
          <Link
            to="/print"
            className="no-print hidden items-center gap-1 text-sm text-primary underline sm:inline-flex"
          >
            <Printer className="size-4" /> {t("portal.exportAll")}
          </Link>
        </div>
        {ordered.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed p-6 text-center">
            <p>{t("portal.noResults")}</p>
            <Link
              to="/report"
              search={{ what: q }}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
            >
              {t("portal.report")}
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map(({ s, content }) => (
              <li key={s.id}>
                <Link
                  to="/situations/$slug"
                  params={{ slug: s.slug }}
                  className="group flex h-full gap-3 rounded-xl border bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <SituationIcon name={content.icon} className="size-5" />
                  </span>
                  <span>
                    <span className="block font-semibold leading-snug group-hover:text-primary">
                      {content.title}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {content.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PortalShell>
  );
}
