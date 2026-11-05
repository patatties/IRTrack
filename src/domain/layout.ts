import type { Flowchart } from "./types";

/** Simple layered auto-layout: breadth-first levels from the Start node. */
export function autoLayout(f: Flowchart): Flowchart {
  const start = f.nodes.find((n) => n.type === "start") ?? f.nodes[0];
  if (!start) return f;
  const level = new Map<string, number>([[start.id, 0]]);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of f.edges.filter((e) => e.source === id)) {
      if (!level.has(e.target)) {
        level.set(e.target, level.get(id)! + 1);
        queue.push(e.target);
      }
    }
  }
  let maxL = Math.max(0, ...level.values());
  const rows = new Map<number, string[]>();
  for (const n of f.nodes) {
    const l = level.get(n.id) ?? ++maxL;
    rows.set(l, [...(rows.get(l) ?? []), n.id]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  rows.forEach((ids, l) => {
    const width = ids.length * 260;
    ids.forEach((id, i) => pos.set(id, { x: i * 260 - width / 2 + 130, y: l * 140 }));
  });
  return { ...f, nodes: f.nodes.map((n) => ({ ...n, ...pos.get(n.id)! })) };
}
