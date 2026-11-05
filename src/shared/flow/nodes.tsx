import { Handle, Position, type Node, type Edge, type NodeProps, MarkerType } from "@xyflow/react";
import { CircleHelp, Flag, Phone, Play, Siren, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Flowchart, NodeType } from "@/domain/types";

export type FlowNodeData = {
  label: string;
  type: NodeType;
  active?: boolean;
  visited?: boolean;
  error?: boolean;
  refLabel?: string;
};

const ICON: Record<NodeType, typeof Play> = {
  start: Play,
  question: CircleHelp,
  action: CheckCircle2,
  contact: Phone,
  escalate: Siren,
  report: FileText,
  end: Flag,
};
const STYLE: Record<NodeType, string> = {
  start: "bg-foreground text-background border-foreground rounded-full",
  question: "bg-accent text-accent-foreground border-warning",
  action: "bg-card text-card-foreground border-border",
  contact: "bg-primary-soft text-foreground border-primary/40",
  escalate: "bg-card text-foreground border-sev-4 border-dashed",
  report: "bg-primary text-primary-foreground border-primary",
  end: "bg-muted text-foreground border-border rounded-full",
};
export const NODE_LABEL: Record<NodeType, string> = {
  start: "Start",
  question: "Question",
  action: "Action",
  contact: "Contact",
  escalate: "Escalate",
  report: "Report",
  end: "End",
};

function FlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const Icon = ICON[data.type];
  return (
    <div
      className={cn(
        "w-[220px] rounded-lg border-2 px-3 py-2 text-sm shadow-card transition-all",
        STYLE[data.type],
        data.visited && "ring-2 ring-primary/60",
        data.active && "ring-4 ring-primary scale-105",
        data.error && "ring-4 ring-destructive",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <div className="text-[10px] uppercase tracking-wider opacity-70">
            {NODE_LABEL[data.type]}
          </div>
          <div className="font-medium leading-snug">{data.label}</div>
          {data.refLabel && (
            <div className="mt-1 text-xs opacity-80 underline decoration-dotted">
              {data.refLabel}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}
export const nodeTypes = { flow: FlowNode };

export function toReactFlow(
  f: Flowchart,
  opts: {
    visited?: Set<string>;
    active?: string;
    pathEdges?: Set<string>;
    errors?: Set<string>;
    refLabel?: (id: string) => string | undefined;
  } = {},
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  return {
    nodes: f.nodes.map((n) => ({
      id: n.id,
      type: "flow",
      position: { x: n.x, y: n.y },
      data: {
        label: n.label,
        type: n.type,
        active: opts.active === n.id,
        visited: opts.visited?.has(n.id),
        error: opts.errors?.has(n.id),
        refLabel: opts.refLabel?.(n.id),
      },
    })),
    edges: f.edges.map((e) => {
      const on = opts.pathEdges?.has(e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: on,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          strokeWidth: on ? 3 : 1.5,
          stroke: on ? "var(--primary)" : "var(--muted-foreground)",
        },
        labelStyle: { fontWeight: 600, fill: "var(--foreground)" },
        labelBgStyle: { fill: "var(--card)" },
      };
    }),
  };
}
