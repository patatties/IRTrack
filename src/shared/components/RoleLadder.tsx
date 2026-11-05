import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, Siren } from "lucide-react";
import { LEVELS, type Contact, type LevelId, type Process, type Role } from "@/domain/types";
import { LevelBadge } from "./badges";
import { t } from "@/i18n";

export const LEVEL_COLOR: Record<LevelId, string> = {
  standard: "var(--sev-1)",
  elevated: "var(--sev-2)",
  coordinated: "var(--sev-3)",
  critical: "var(--sev-4)",
};
const tint = (l: LevelId) => `color-mix(in oklch, ${LEVEL_COLOR[l]} 14%, var(--background))`;

/** Contacts that fill a role, in the configured contact order. */
export const contactsOf = (role: Role, contacts: Contact[]) =>
  contacts.filter((c) => c.roleIds?.includes(role.id)).sort((a, b) => a.order - b.order);

/**
 * How an incident grows, as four steps from left to right. With a process, the steps use that
 * process's own names (e.g. SOC analyst → Security incident lead → IRT (CSIRT) → CRT (CERT)).
 */
export function LevelFlow({ process }: { process?: Process }) {
  return (
    <ol className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
      {LEVELS.map((l, k) => (
        <li key={l} className="contents">
          {k > 0 && (
            <span
              className="hidden items-center justify-center text-muted-foreground md:flex"
              aria-hidden
            >
              <ArrowRight className="size-5" />
            </span>
          )}
          <div
            className="rounded-xl border p-3"
            style={{ borderTop: `5px solid ${LEVEL_COLOR[l]}`, background: tint(l) }}
          >
            <span className="font-mono text-xs text-muted-foreground">
              {t("roles.level", { n: k + 1 })}
            </span>
            <p className="mt-0.5 font-semibold">{process?.levelNames[l] || t(`level.${l}`)}</p>
            <div className="mt-1">
              <LevelBadge l={l} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t(`levelHelp.${l}`)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The escalation ladder with roles leading: per level (top = least serious) the roles, each with
 * the contacts who fill it. Contacts without a role come last: emergency services, then others.
 */
export function RoleLadder({
  roles,
  contacts,
  renderRole,
  renderContact,
  process,
  emptyLevel,
}: {
  roles: Role[];
  contacts: Contact[];
  renderRole: (role: Role, contacts: Contact[]) => ReactNode;
  renderContact: (c: Contact) => ReactNode;
  process?: Process;
  emptyLevel?: ReactNode;
}) {
  const byName = (a: Role, b: Role) => a.name.localeCompare(b.name);
  const noRole = contacts
    .filter((c) => !c.roleIds?.some((id) => roles.some((r) => r.id === id)))
    .sort((a, b) => a.order - b.order);
  const emergency = noRole.filter((c) => c.emergency);
  const other = noRole.filter((c) => !c.emergency);
  const unlevelled = roles.filter((r) => !r.level).sort(byName);
  const grid = "grid gap-3 md:grid-cols-2 xl:grid-cols-3";

  return (
    <div>
      <ol>
        {LEVELS.map((l, k) => {
          const xs = roles.filter((r) => r.level === l).sort(byName);
          if (!xs.length && !emptyLevel) return null;
          return (
            <li key={l}>
              {k > 0 && (
                <div className="flex items-center gap-2 py-1 pl-5 text-xs text-muted-foreground">
                  <ArrowDown className="size-4" /> {t("roles.escalate")}
                </div>
              )}
              <section
                className="rounded-xl border p-4"
                style={{ borderLeft: `6px solid ${LEVEL_COLOR[l]}`, background: tint(l) }}
              >
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-lg font-semibold">
                    {t("roles.level", { n: k + 1 })} · {process?.levelNames[l] || t(`level.${l}`)}
                  </h2>
                  <LevelBadge l={l} />
                  <p className="w-full text-sm text-muted-foreground">{t(`levelHelp.${l}`)}</p>
                </div>
                {xs.length ? (
                  <div className={grid}>
                    {xs.map((r) => (
                      <div key={r.id}>{renderRole(r, contactsOf(r, contacts))}</div>
                    ))}
                  </div>
                ) : (
                  emptyLevel
                )}
              </section>
            </li>
          );
        })}
      </ol>

      {emergency.length > 0 && (
        <section className="mt-6 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-destructive">
            <Siren className="size-5" /> {t("contacts.ladder.emergency")}
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("contacts.ladder.emergencyHelp")}</p>
          <div className={grid}>
            {emergency.map((c) => (
              <div key={c.id}>{renderContact(c)}</div>
            ))}
          </div>
        </section>
      )}
      {unlevelled.length > 0 && (
        <section className="mt-6 rounded-xl border border-dashed bg-muted/60 p-4">
          <h2 className="text-lg font-semibold">{t("roles.other")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("roles.otherHelp")}</p>
          <div className={grid}>
            {unlevelled.map((r) => (
              <div key={r.id}>{renderRole(r, contactsOf(r, contacts))}</div>
            ))}
          </div>
        </section>
      )}
      {other.length > 0 && (
        <section className="mt-6 rounded-xl border border-dashed bg-muted/60 p-4">
          <h2 className="text-lg font-semibold">{t("contacts.ladder.other")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("contacts.ladder.otherHelp")}</p>
          <div className={grid}>
            {other.map((c) => (
              <div key={c.id}>{renderContact(c)}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Short list of the contacts in a role, with a call link. */
export function RoleContacts({
  contacts,
  onPick,
}: {
  contacts: Contact[];
  onPick?: (c: Contact) => void;
}) {
  if (!contacts.length)
    return <p className="text-xs text-muted-foreground">{t("roles.noContacts")}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {contacts.map((c) => (
        <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
          {onPick ? (
            <button
              type="button"
              className="font-medium underline-offset-2 hover:underline"
              onClick={() => onPick(c)}
            >
              {c.name}
            </button>
          ) : (
            <span className="font-medium">{c.name}</span>
          )}
          {c.emergency && <Siren className="size-3 text-destructive" aria-label="Emergency" />}
          {c.phone ? (
            <a className="text-primary underline" href={`tel:${c.phone.replace(/\s/g, "")}`}>
              {c.phone}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">{c.email || c.availability}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
