import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw, Phone, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Contact, Flowchart, Role } from "@/domain/types";
import { nodeTypes, toReactFlow, NODE_LABEL } from "./nodes";
import { ContactCard } from "../components/ContactCard";

interface Props {
  flowchart: Flowchart;
  contacts: Contact[];
  roles: Role[];
  reportSituation?: string;
  forceMode?: "desktop" | "mobile";
}

export function FlowchartViewer({ flowchart, contacts, roles, reportSituation, forceMode }: Props) {
  const isMobile = useIsMobile();
  const mobile = forceMode ? forceMode === "mobile" : isMobile;
  const start = flowchart.nodes.find((n) => n.type === "start") ?? flowchart.nodes[0];
  const [path, setPath] = useState<{ node: string; edge?: string }[]>([{ node: start?.id }]);
  const [detail, setDetail] = useState<{ kind: "contact" | "role"; id: string } | null>(null);
  const current = flowchart.nodes.find((n) => n.id === path[path.length - 1].node);
  const outgoing = flowchart.edges.filter((e) => e.source === current?.id);
  const visited = new Set(path.map((p) => p.node));
  const pathEdges = new Set(path.map((p) => p.edge).filter(Boolean) as string[]);
  const refName = (id: string) => {
    const n = flowchart.nodes.find((x) => x.id === id);
    if (!n?.ref) return undefined;
    if (n.ref.kind === "contact")
      return contacts.find((c) => c.id === n.ref!.id)?.name ?? "Missing contact";
    if (n.ref.kind === "role") return roles.find((r) => r.id === n.ref!.id)?.name ?? "Missing role";
    return undefined;
  };
  const rf = useMemo(
    () => toReactFlow(flowchart, { visited, active: current?.id, pathEdges, refLabel: refName }),
    [flowchart, path, contacts, roles],
  );
  const go = (edgeId: string) => {
    const e = flowchart.edges.find((x) => x.id === edgeId)!;
    setPath((p) => [...p, { node: e.target, edge: e.id }]);
  };
  const terminal =
    current && (current.type === "end" || current.type === "report" || outgoing.length === 0);
  const contactsOnPath = path
    .map((p) => flowchart.nodes.find((n) => n.id === p.node))
    .filter((n) => n?.ref?.kind === "contact")
    .map((n) => contacts.find((c) => c.id === n!.ref!.id))
    .filter(Boolean) as Contact[];

  const stepper = (
    <div className="rounded-xl border bg-card p-5 shadow-card" aria-live="polite">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Step {path.length}</span>
        <div className="flex gap-1">
          {path.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setPath((p) => p.slice(0, -1))}>
              <ArrowLeft className="size-4" /> Back
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setPath([{ node: start.id }])}>
            <RotateCcw className="size-4" /> Restart
          </Button>
        </div>
      </div>
      {current && (
        <>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {NODE_LABEL[current.type]}
          </div>
          <p className="mt-1 text-xl font-semibold leading-snug">{current.label}</p>
          {current.ref && (current.ref.kind === "contact" || current.ref.kind === "role") && (
            <button
              className="mt-2 text-sm text-primary underline"
              onClick={() =>
                setDetail({ kind: current.ref!.kind as "contact", id: current.ref!.id })
              }
            >
              {current.ref.kind === "contact" ? "Show contact details" : "What does this role do?"}:{" "}
              {refName(current.id)}
            </button>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {!terminal &&
              (current.type === "question" ? (
                outgoing.map((e) => (
                  <Button
                    key={e.id}
                    size="lg"
                    variant="outline"
                    className="h-auto justify-start py-3 text-base"
                    onClick={() => go(e.id)}
                  >
                    {e.label ?? "Continue"}
                  </Button>
                ))
              ) : (
                <Button size="lg" onClick={() => go(outgoing[0].id)}>
                  Done, next step
                </Button>
              ))}
          </div>
          {terminal && (
            <div className="mt-4 space-y-3 rounded-lg bg-primary-soft p-4">
              <p className="font-semibold">Your result</p>
              <p className="text-sm">
                {current.type === "report"
                  ? "Please report this incident so the right team can follow up."
                  : "No report is needed unless something changes."}
              </p>
              {contactsOnPath.length > 0 && (
                <div className="text-sm">
                  Contact:{" "}
                  {contactsOnPath.map((c) => (
                    <a
                      key={c.id}
                      href={`tel:${c.phone}`}
                      className="mr-3 inline-flex items-center gap-1 font-semibold text-primary underline"
                    >
                      <Phone className="size-3" /> {c.name} {c.phone}
                    </a>
                  ))}
                </div>
              )}
              {current.type === "report" && reportSituation && (
                <Button asChild>
                  <Link to="/report" search={{ situation: reportSituation }}>
                    <FileText className="size-4" /> Report this incident
                  </Link>
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  const textVersion = (
    <ol className="space-y-2 text-sm">
      {flowchart.nodes.map((n, i) => {
        const outs = flowchart.edges.filter((e) => e.source === n.id);
        return (
          <li key={n.id} className="rounded-md border bg-card p-3">
            <span className="font-mono text-xs text-muted-foreground">
              {i + 1}. {NODE_LABEL[n.type]}
            </span>
            <div className="font-medium">
              {n.label}
              {refName(n.id) ? ` — ${refName(n.id)}` : ""}
            </div>
            {outs.length > 0 && (
              <ul className="mt-1 text-muted-foreground">
                {outs.map((e) => (
                  <li key={e.id}>
                    → {e.label ? `${e.label}: ` : ""}go to step{" "}
                    {flowchart.nodes.findIndex((x) => x.id === e.target) + 1}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      <Tabs key={mobile ? "m" : "d"} defaultValue={mobile ? "steps" : "visual"}>
        <TabsList>
          {!mobile && <TabsTrigger value="visual">Flowchart</TabsTrigger>}
          <TabsTrigger value="steps">Step by step</TabsTrigger>
          <TabsTrigger value="text">Text version</TabsTrigger>
        </TabsList>
        {!mobile && (
          <TabsContent value="visual">
            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <div className="h-[560px] overflow-hidden rounded-xl border bg-muted/40">
                <ReactFlow
                  nodes={rf.nodes}
                  edges={rf.edges}
                  nodeTypes={nodeTypes}
                  fitView
                  nodesDraggable={false}
                  nodesConnectable={false}
                  onNodeClick={(_, n) => {
                    const fn = flowchart.nodes.find((x) => x.id === n.id);
                    if (fn?.ref && (fn.ref.kind === "contact" || fn.ref.kind === "role"))
                      setDetail({ kind: fn.ref.kind, id: fn.ref.id });
                  }}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
              {stepper}
            </div>
          </TabsContent>
        )}
        <TabsContent value="steps">{stepper}</TabsContent>
        <TabsContent value="text">{textVersion}</TabsContent>
      </Tabs>
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{detail?.kind === "contact" ? "Contact" : "Role"}</SheetTitle>
          </SheetHeader>
          <div className="p-4">
            {detail?.kind === "contact" &&
              (() => {
                const c = contacts.find((x) => x.id === detail.id);
                return c ? (
                  <ContactCard c={c} backup={contacts.find((x) => x.id === c.backupId)} />
                ) : (
                  <p>This contact no longer exists.</p>
                );
              })()}
            {detail?.kind === "role" &&
              (() => {
                const r = roles.find((x) => x.id === detail.id);
                return r ? <RoleDetail r={r} /> : <p>This role no longer exists.</p>;
              })()}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function RoleDetail({ r }: { r: Role }) {
  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-lg font-semibold">{r.name}</h3>
      <p className="text-muted-foreground">{r.summary}</p>
      <div>
        <p className="font-semibold">Does</p>
        <ul className="list-disc pl-5">
          {r.responsibilities.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      {r.decides.length > 0 && (
        <div>
          <p className="font-semibold">Decides</p>
          <ul className="list-disc pl-5">
            {r.decides.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="font-semibold">When the incident escalates</p>
        <p>{r.onEscalation}</p>
      </div>
    </div>
  );
}
