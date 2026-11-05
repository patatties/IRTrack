import { PHASES, type Raci, type ResponsibilityAssignment, type Role } from "@/domain/types";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const LABEL: Record<Raci, string> = {
  R: "Does the work",
  A: "Decides / accountable",
  C: "Is consulted",
  I: "Is informed",
};
const STYLE: Record<Raci, string> = {
  R: "bg-primary text-primary-foreground",
  A: "bg-foreground text-background",
  C: "bg-accent text-accent-foreground",
  I: "bg-muted text-muted-foreground",
};
const NEXT: Record<Raci, Raci> = { R: "A", A: "C", C: "I", I: "R" };

export function RaciMatrix({
  roles,
  raci,
  roleIds,
  onChange,
}: {
  roles: Role[];
  raci: ResponsibilityAssignment[];
  roleIds: string[];
  onChange?: (a: ResponsibilityAssignment) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="text-left font-medium text-muted-foreground">Role</th>
            {PHASES.map((p) => (
              <th key={p} className="font-medium text-muted-foreground">
                {t(`phase.${p}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roleIds.map((rid) => (
            <tr key={rid}>
              <th className="text-left font-medium">
                {roles.find((r) => r.id === rid)?.name ?? rid}
              </th>
              {PHASES.map((p) => {
                const a = raci.find((x) => x.roleId === rid && x.phase === p);
                const v = a?.value ?? "I";
                const cell = (
                  <span
                    className={cn(
                      "grid h-9 place-items-center rounded font-mono font-semibold",
                      STYLE[v],
                    )}
                    title={LABEL[v]}
                  >
                    {v}
                  </span>
                );
                return (
                  <td key={p} className="text-center">
                    {onChange && a ? (
                      <button
                        className="w-full"
                        aria-label={`${rid} ${p}: ${LABEL[v]}. Click to change.`}
                        onClick={() => onChange({ ...a, value: NEXT[v] })}
                      >
                        {cell}
                      </button>
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {(Object.keys(LABEL) as Raci[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn("grid size-5 place-items-center rounded font-mono", STYLE[k])}>
              {k}
            </span>
            {LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
