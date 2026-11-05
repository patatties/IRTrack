import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Cable,
  FileBarChart,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Phone,
  Settings,
  Timer,
  Users,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import { AppLogo } from "@/shared/components/AppLogo";
import { Assistant } from "@/shared/components/Assistant";
import { AdminGuard, useAuth } from "@/auth/permissions";
import { t } from "@/i18n";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { FirstUseTour } from "@/shared/components/FirstUseTour";
import { useSettings } from "@/shared/hooks";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — IRTrack" },
      {
        name: "description",
        content:
          "Manage incidents, deadlines, guidance, contacts and processes across all domains.",
      },
      { property: "og:title", content: "Admin Console — IRTrack" },
      {
        property: "og:description",
        content: "Manage incidents, deadlines, guidance, contacts and processes.",
      },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", icon: LayoutDashboard, key: "dashboard", exact: true },
  { to: "/admin/incidents", icon: ListChecks, key: "incidents" },
  { to: "/admin/deadlines", icon: Timer, key: "deadlines" },
  { to: "/admin/guidance", icon: BookOpen, key: "guidance" },
  { to: "/admin/contacts", icon: Phone, key: "contacts" },
  { to: "/admin/roles", icon: Users, key: "roles" },
  { to: "/admin/processes", icon: GitBranch, key: "processes" },
  { to: "/admin/sources", icon: Cable, key: "sources" },
  { to: "/admin/reports", icon: FileBarChart, key: "reports" },
  { to: "/admin/settings", icon: Settings, key: "settings" },
  { to: "/admin/glossary", icon: HelpCircle, key: "glossary" },
] as const;

function AdminLayout() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  return (
    <AdminGuard>
      <div className="flex min-h-screen">
        <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
          <Link to="/admin" className="flex items-center gap-2 px-5 py-5">
            <AppLogo className="size-9" />
            <span className="font-display text-lg font-semibold">IRTrack</span>
          </Link>
          <nav className="flex-1 space-y-0.5 px-3" aria-label="Admin">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: "exact" in n }}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{
                  className: "!bg-sidebar-accent !text-sidebar-accent-foreground font-semibold",
                }}
              >
                <n.icon className="size-4" /> {t(`admin.nav.${n.key}`)}
              </Link>
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-4 text-xs">
            <p className="font-medium">{user.name}</p>
            <p className="opacity-70">{user.role}</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b bg-background/90 px-6 py-3 backdrop-blur">
            <nav className="flex gap-1 overflow-x-auto lg:hidden" aria-label="Admin mobile">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="rounded p-2 hover:bg-muted"
                  aria-label={t(`admin.nav.${n.key}`)}
                >
                  <n.icon className="size-4" />
                </Link>
              ))}
            </nav>
            <span className="hidden text-sm text-muted-foreground lg:inline">
              {settings?.organization.name}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Link
                to="/admin/wallboard"
                className="hidden items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted md:inline-flex"
              >
                <BarChart3 className="size-4" /> {t("admin.wallboard")}
              </Link>
              <ThemeToggle />
              <Link
                to="/"
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                <ExternalLink className="size-4" /> {t("admin.viewPortal")}
              </Link>
            </div>
          </header>
          <main className="p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <FirstUseTour area="admin" />
      <Assistant mode="admin" />
    </AdminGuard>
  );
}
