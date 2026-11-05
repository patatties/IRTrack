import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSSARY } from "./glossary";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  takeaway,
  children,
  className = "",
  actions,
}: {
  title?: string;
  takeaway?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border bg-card p-5 shadow-card ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            {title && <h2 className="font-sans text-base font-semibold">{title}</h2>}
            {takeaway && <p className="text-sm text-muted-foreground">{takeaway}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Explains jargon inline. */
export function Term({ k, children }: { k: keyof typeof GLOSSARY; children?: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2"
        >
          {children ?? k} <Info className="size-3 opacity-60" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{GLOSSARY[k]}</TooltipContent>
    </Tooltip>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
      {children}
    </div>
  );
}
