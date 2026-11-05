import {
  AlertOctagon,
  AlertTriangle,
  Circle,
  Info,
  Lock,
  ShieldAlert,
  Users,
  User,
  Siren,
  Building2,
} from "lucide-react";
import { cva } from "class-variance-authority";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Classification, LevelId, PhaseId, Severity, SourceId, Tlp } from "@/domain/types";
import { PHASES } from "@/domain/types";

const pill = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-foreground",
        info: "border-sev-2/40 bg-sev-2/15 text-foreground",
        warn: "border-sev-3/50 bg-sev-3/20 text-foreground",
        danger: "border-sev-4 bg-sev-4 text-destructive-foreground",
        primary: "border-primary/30 bg-primary-soft text-foreground",
        dark: "border-foreground/80 bg-foreground text-background",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const SEV_ICON = { 1: Circle, 2: Info, 3: AlertTriangle, 4: AlertOctagon } as const;
const SEV_TONE = { 1: "neutral", 2: "info", 3: "warn", 4: "danger" } as const;

/** Severity is shown with icon + text, never by color alone. */
export function SeverityBadge({ s, className }: { s: Severity; className?: string }) {
  const Icon = SEV_ICON[s];
  return (
    <span className={cn(pill({ tone: SEV_TONE[s] }), className)}>
      <Icon className="size-3" aria-hidden />
      {s} · {t(`severity.${s}`)}
    </span>
  );
}

const LV_ICON = {
  standard: User,
  elevated: ShieldAlert,
  coordinated: Users,
  critical: Siren,
} as const;
export function LevelBadge({ l, local }: { l: LevelId; local?: string }) {
  const Icon = LV_ICON[l];
  const tone = l === "critical" ? "danger" : l === "coordinated" ? "primary" : "neutral";
  return (
    <span className={pill({ tone })} title={t(`levelHelp.${l}`)}>
      <Icon className="size-3" aria-hidden />
      {t(`level.${l}`)}
      {local && local !== t(`level.${l}`) ? <span className="opacity-70">· {local}</span> : null}
    </span>
  );
}

export function PhaseBadge({ p, local }: { p: PhaseId; local?: string }) {
  const idx = PHASES.indexOf(p);
  return (
    <span className={pill({ tone: "neutral" })}>
      <span className="font-mono text-[10px] opacity-60">{idx + 1}/5</span>
      {local ?? t(`phase.${p}`)}
    </span>
  );
}

export function ClassBadge({ c, tlp }: { c: Classification; tlp?: Tlp }) {
  return (
    <>
      {c !== "normal" && (
        <span className={pill({ tone: "dark" })}>
          <Lock className="size-3" aria-hidden /> {t(`classification.${c}`)}
        </span>
      )}
      {tlp && (
        <span
          className={pill({
            tone: tlp === "red" ? "danger" : tlp.startsWith("amber") ? "warn" : "neutral",
          })}
        >
          TLP:{tlp.toUpperCase()}
        </span>
      )}
    </>
  );
}

export function SourceBadge({ s }: { s: SourceId }) {
  return (
    <span className={pill({ tone: "neutral" })}>
      <Building2 className="size-3 opacity-60" aria-hidden />
      {t(`source.${s}`)}
    </span>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone?: "neutral" | "info" | "warn" | "danger" | "primary" | "dark";
  children: React.ReactNode;
}) {
  return <span className={pill({ tone })}>{children}</span>;
}
