import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type NodeChange,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Contact, Flowchart, FlowchartNode, NodeType, Process, Role } from "@/domain/types";
import { LEVELS } from "@/domain/types";
import { autoLayout } from "@/domain/layout";
import type { FlowIssue } from "@/domain/rules";
import { nodeTypes, toReactFlow, NODE_LABEL } from "@/shared/flow/nodes";
import { t } from "@/i18n";

const TYPES: NodeType[] = ["start", "question", "action", "contact", "escalate", "report", "end"];

export function FlowBuilder({
  value,
  onChange,
  issues,
  contacts,
  roles,
  processes,
}: {
  value: Flowchart;
  onChange: (f: Flowchart) => void;
  issues: FlowIssue[];
  contacts: Contact[];
  roles: Role[];
  processes: Process[];
}) {
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const errors = useMemo(
    () => new Set(issues.filter((i) => i.severity === "error" && i.nodeId).map((i) => i.nodeId!)),
    [issues],
  );
  const rf = useMemo(
    () => toReactFlow(value, { errors, active: selNode ?? undefined }),
    [value, errors, selNode],
  );
  const node = value.nodes.find((n) => n.id === selNode);
  const edge = value.edges.find((e) => e.id === selEdge);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const moved = applyNodeChanges(changes, rf.nodes);
      onChange({
        ...value,
        nodes: value.nodes.map((n) => {
          const m = moved.find((x) => x.id === n.id);
          return m ? { ...n, x: m.position.x, y: m.position.y } : n;
        }),
      });
    },
    [rf.nodes, value, onChange],
  );
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    const src = value.nodes.find((n) => n.id === c.source);
    const existing = value.edges.filter((e) => e.source === c.source).length;
    const label =
      src?.type === "question" ? (["Yes", "No", "Not sure"][existing] ?? "") : undefined;
    onChange({
      ...value,
      edges: [
        ...value.edges,
        { id: crypto.randomUUID(), source: c.source, target: c.target, label },
      ],
    });
  };
  const add = (type: NodeType) => {
    const n: FlowchartNode = {
      id: crypto.randomUUID().slice(0, 8),
      type,
      label: `New ${NODE_LABEL[type].toLowerCase()}`,
      x: 40 + Math.random() * 200,
      y: 40 + Math.random() * 100,
    };
    onChange({ ...value, nodes: [...value.nodes, n] });
    setSelNode(n.id);
  };
  const patchNode = (p: Partial<FlowchartNode>) =>
    onChange({ ...value, nodes: value.nodes.map((n) => (n.id === selNode ? { ...n, ...p } : n)) });
  const del = () => {
    if (selNode)
      onChange({
        nodes: value.nodes.filter((n) => n.id !== selNode),
        edges: value.edges.filter((e) => e.source !== selNode && e.target !== selNode),
      });
    if (selEdge) onChange({ ...value, edges: value.edges.filter((e) => e.id !== selEdge) });
    setSelNode(null);
    setSelEdge(null);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-2 flex flex-wrap gap-1">
          {TYPES.map((tp) => (
            <Button key={tp} size="sm" variant="outline" onClick={() => add(tp)}>
              <Plus className="size-3" /> {NODE_LABEL[tp]}
            </Button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => onChange(autoLayout(value))}>
            <Wand2 className="size-3" /> Auto layout
          </Button>
          {(selNode || selEdge) && (
            <Button size="sm" variant="destructive" onClick={del}>
              <Trash2 className="size-3" /> Delete selected
            </Button>
          )}
        </div>
        <div className="h-[600px] overflow-hidden rounded-xl border bg-muted/40">
          <ReactFlow
            nodes={rf.nodes}
            edges={rf.edges.map((e) => ({ ...e, selected: e.id === selEdge }))}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelNode(n.id);
              setSelEdge(null);
            }}
            onEdgeClick={(_, e) => {
              setSelEdge(e.id);
              setSelNode(null);
            }}
            onPaneClick={() => {
              setSelNode(null);
              setSelEdge(null);
            }}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Drag from the bottom dot of a step to the top dot of another to connect them.
        </p>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 font-semibold">Validation</p>
          {issues.length === 0 ? (
            <p className="text-sm text-success">✓ No problems found. Ready to publish.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {issues.map((i, k) => (
                <li key={k}>
                  <button
                    className={
                      i.severity === "error"
                        ? "text-left text-destructive"
                        : "text-left text-muted-foreground"
                    }
                    onClick={() => i.nodeId && setSelNode(i.nodeId)}
                  >
                    {i.severity === "error" ? "✕" : "⚠"} {i.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {node && (
          <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <p className="font-semibold">Step: {NODE_LABEL[node.type]}</p>
            <label className="block">
              Text
              <Input value={node.label} onChange={(e) => patchNode({ label: e.target.value })} />
            </label>
            <label className="block">
              Type
              <select
                value={node.type}
                onChange={(e) => patchNode({ type: e.target.value as NodeType })}
                className="mt-1 w-full rounded-md border bg-card p-2"
              >
                {TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {NODE_LABEL[tp]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Linked record
              <select
                value={node.ref ? `${node.ref.kind}:${node.ref.id}` : ""}
                onChange={(e) => {
                  const [kind, id] = e.target.value.split(":");
                  patchNode({ ref: e.target.value ? { kind: kind as "contact", id } : undefined });
                }}
                className="mt-1 w-full rounded-md border bg-card p-2"
              >
                <option value="">None</option>
                <optgroup label="Contacts">
                  {contacts.map((c) => (
                    <option key={c.id} value={`contact:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Roles">
                  {roles.map((r) => (
                    <option key={r.id} value={`role:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Processes">
                  {processes.map((p) => (
                    <option key={p.id} value={`process:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Response levels">
                  {LEVELS.map((l) => (
                    <option key={l} value={`level:${l}`}>
                      {t(`level.${l}`)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
        )}
        {edge && (
          <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <p className="font-semibold">Answer / connection</p>
            <div className="flex gap-1">
              {["Yes", "No", "Not sure"].map((l) => (
                <Button
                  key={l}
                  size="sm"
                  variant={edge.label === l ? "default" : "outline"}
                  onClick={() =>
                    onChange({
                      ...value,
                      edges: value.edges.map((e) => (e.id === edge.id ? { ...e, label: l } : e)),
                    })
                  }
                >
                  {l}
                </Button>
              ))}
            </div>
            <Input
              value={edge.label ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  edges: value.edges.map((x) =>
                    x.id === edge.id ? { ...x, label: e.target.value } : x,
                  ),
                })
              }
              placeholder="Custom label"
            />
          </div>
        )}
      </div>
    </div>
  );
}
