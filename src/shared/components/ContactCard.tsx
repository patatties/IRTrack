import { Mail, Moon, Phone, Siren, AlertTriangle } from "lucide-react";
import { differenceInDays } from "date-fns";
import type { Contact } from "@/domain/types";
import { Pill } from "./badges";

export function ContactCard({
  c,
  backup,
  verifyDays = 180,
}: {
  c: Contact;
  backup?: Contact;
  verifyDays?: number;
}) {
  const stale = differenceInDays(new Date(), new Date(c.lastVerifiedAt)) > verifyDays;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{c.name}</p>
          <p className="text-sm text-muted-foreground">
            {c.role} · {c.team}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {c.emergency && (
            <Pill tone="danger">
              <Siren className="size-3" /> Emergency
            </Pill>
          )}
          {/24\/7|night|weekend|evening/i.test(c.availability) && (
            <Pill tone="primary">
              <Moon className="size-3" /> Out of hours
            </Pill>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {c.phone && (
          <a
            href={`tel:${c.phone.replace(/\s/g, "")}`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Phone className="size-4" /> {c.phone}
          </a>
        )}
        {c.email && (
          <a
            href={`mailto:${c.email}`}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Mail className="size-4" /> {c.email}
          </a>
        )}
      </div>
      <dl className="mt-3 grid gap-1 text-sm">
        <div>
          <dt className="inline font-medium">Available: </dt>
          <dd className="inline">{c.availability}</dd>
        </div>
        {c.whenToContact && (
          <div>
            <dt className="inline font-medium">Contact when: </dt>
            <dd className="inline">{c.whenToContact}</dd>
          </div>
        )}
        {c.outOfHours && (
          <div>
            <dt className="inline font-medium">Out of hours: </dt>
            <dd className="inline">{c.outOfHours}</dd>
          </div>
        )}
        {backup && (
          <div>
            <dt className="inline font-medium">Backup: </dt>
            <dd className="inline">
              {backup.name} {backup.phone && `(${backup.phone})`}
            </dd>
          </div>
        )}
      </dl>
      {stale && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <AlertTriangle className="size-3" /> Details not verified recently.
        </p>
      )}
    </div>
  );
}
