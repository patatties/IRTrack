import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FileText, Phone, Siren, LayoutDashboard } from "lucide-react";
import { AppLogo } from "@/shared/components/AppLogo";
import { Assistant } from "@/shared/components/Assistant";
import { t } from "@/i18n";
import { useSettings } from "@/shared/hooks";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { FirstUseTour } from "@/shared/components/FirstUseTour";

export function PortalShell({ children }: { children: ReactNode }) {
  const { data: s } = useSettings();
  const nav = [
    { to: "/", label: t("portal.nav.home") },
    { to: "/contacts", label: t("portal.nav.contacts") },
    { to: "/roles", label: t("portal.nav.roles") },
    { to: "/track", label: t("portal.nav.track") },
  ] as const;
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2"
      >
        Skip to content
      </a>
      <div className="no-print bg-sev-4 text-destructive-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-sm font-medium">
          <Siren className="size-4 shrink-0" aria-hidden />
          <span>{s?.portal.emergencyMessage ?? t("portal.emergency")}</span>
          <a
            href={`tel:${s?.portal.emergencyNumber ?? "112"}`}
            className="ml-auto rounded bg-background/20 px-2 py-0.5 font-bold underline"
          >
            {s?.portal.emergencyNumber ?? "112"}
          </a>
        </div>
      </div>
      <header className="no-print border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <AppLogo className="size-8" />
            <span className="leading-tight">
              <span className="block font-display text-lg font-semibold">IRTrack</span>
              <span className="block text-xs text-muted-foreground">
                {s?.portal.title ?? s?.organization.name}
              </span>
            </span>
          </Link>
          <nav className="ml-6 hidden gap-1 md:flex" aria-label="Portal">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-3 py-2 text-sm hover:bg-muted"
                activeProps={{ className: "bg-muted font-semibold" }}
                activeOptions={{ exact: true }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/report"
              search={{}}
              className="hidden items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 md:inline-flex"
            >
              <FileText className="size-4" /> {t("portal.report")}
            </Link>
            <ThemeToggle />
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <LayoutDashboard className="size-4" />{" "}
              <span className="hidden sm:inline">{t("portal.openAdmin")}</span>
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        {children}
      </main>
      <div className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t bg-card p-3 md:hidden">
        <Link
          to="/report"
          search={{}}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary py-3 font-semibold text-primary-foreground"
        >
          <FileText className="size-4" /> {t("portal.report")}
        </Link>
        <Link
          to="/contacts"
          className="inline-flex items-center justify-center gap-2 rounded-md border py-3 font-semibold"
        >
          <Phone className="size-4" /> {t("portal.whoToCall")}
        </Link>
      </div>
      <FirstUseTour area="portal" />
      <Assistant mode="portal" />
    </div>
  );
}
