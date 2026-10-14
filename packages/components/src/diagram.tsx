import { resolveRows, type DiagramView } from '@mcp-ui-kit/view-spec';
import { useId, useMemo } from 'react';
import { ActionBar, Block, Empty } from './primitives';

type GraphDiagram = Extract<DiagramView, { nodes: string }>;

const NODE_W = 150;
const NODE_H = 40;
const GAP_MAIN = 70;
const GAP_CROSS = 20;
const MAX_NODES = 200;

interface Laid {
  nodes: Array<{ id: string; label: string; x: number; y: number }>;
  edges: Array<{ from: string; to: string; label?: string }>;
  width: number;
  height: number;
}

/** Edges that close a cycle, found by DFS from the sources (then from any unvisited node). */
function backEdges(ids: string[], edges: Array<{ from: string; to: string }>): Set<number> {
  const out = new Map<string, number[]>(ids.map((id) => [id, []]));
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  edges.forEach((e, i) => {
    out.get(e.from)!.push(i);
    indeg.set(e.to, indeg.get(e.to)! + 1);
  });
  const state = new Map<string, 1 | 2>();
  const back = new Set<number>();
  const visit = (start: string) => {
    // iterative DFS: deep graphs must not blow the stack
    const stack: Array<[string, number]> = [[start, 0]];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const list = out.get(top[0])!;
      if (top[1] >= list.length) {
        state.set(top[0], 2);
        stack.pop();
        continue;
      }
      const ei = list[top[1]++]!;
      const next = edges[ei]!.to;
      const st = state.get(next);
      if (st === 1) back.add(ei);
      else if (st === undefined) {
        state.set(next, 1);
        stack.push([next, 0]);
      }
    }
  };
  for (const id of ids) if (indeg.get(id) === 0 && !state.has(id)) visit(id);
  for (const id of ids) if (!state.has(id)) visit(id);
  return back;
}

/** Longest-path rank over the graph without its back edges (a DAG, so it terminates). */
function rankNodes(ids: string[], edges: Array<{ from: string; to: string }>): Map<string, number> {
  const back = backEdges(ids, edges);
  const dag = edges.filter((_, i) => !back.has(i));
  const rank = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of dag) {
      const r = rank.get(e.from)! + 1;
      if (r > rank.get(e.to)!) {
        rank.set(e.to, r);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return rank;
}

/** Layered layout: rank = longest path from a source (cycles are cut), one column/row per rank. */
export function layout(view: GraphDiagram, data: unknown): Laid {
  const rawNodes = resolveRows(data, view.nodes).slice(0, MAX_NODES);
  const ids = rawNodes.map((n) => String(n[view.nodeId] ?? ''));
  const known = new Set(ids);
  const edges = resolveRows(data, view.edges)
    .map((e) => ({ from: String(e[view.edgeFrom] ?? ''), to: String(e[view.edgeTo] ?? ''), ...(view.edgeLabel && e[view.edgeLabel] != null ? { label: String(e[view.edgeLabel]) } : {}) }))
    .filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to);
  const rank = rankNodes(ids, edges);
  const lanes = new Map<number, string[]>();
  for (const id of ids) lanes.set(rank.get(id)!, [...(lanes.get(rank.get(id)!) ?? []), id]);
  const lr = (view.direction ?? 'LR') === 'LR';
  const labelOf = new Map(rawNodes.map((n, i) => [ids[i]!, String(n[view.nodeLabel] ?? ids[i])]));
  const nodes: Laid['nodes'] = [];
  let maxCross = 0;
  for (const [r, list] of lanes) {
    list.forEach((id, i) => {
      const main = r * ((lr ? NODE_W : NODE_H) + GAP_MAIN);
      const cross = i * ((lr ? NODE_H : NODE_W) + GAP_CROSS);
      maxCross = Math.max(maxCross, cross);
      nodes.push({ id, label: labelOf.get(id)!, x: lr ? main : cross, y: lr ? cross : main });
    });
  }
  const ranks = Math.max(0, ...lanes.keys()) + 1;
  const mainLen = ranks * ((lr ? NODE_W : NODE_H) + GAP_MAIN) - GAP_MAIN;
  const crossLen = maxCross + (lr ? NODE_H : NODE_W);
  return { nodes, edges, width: (lr ? mainLen : crossLen) + 2, height: (lr ? crossLen : mainLen) + 2 };
}

export function DiagramResult({ view, data }: { view: GraphDiagram; data: unknown }) {
  const id = useId().replace(/:/g, '');
  const g = useMemo(() => layout(view, data), [view, data]);
  const lr = (view.direction ?? 'LR') === 'LR';
  const at = new Map(g.nodes.map((n) => [n.id, n]));
  if (!g.nodes.length) {
    return (
      <Block title={view.title}>
        <Empty />
      </Block>
    );
  }
  return (
    <Block title={view.title} subtitle={view.subtitle}>
      <div className="mui-diagram">
        <svg viewBox={`-1 -1 ${g.width} ${g.height}`} width={g.width} role="img" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>{view.title ?? 'Diagram'}</title>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0L10,5L0,10z" fill="var(--color-text-tertiary)" />
            </marker>
          </defs>
          {g.edges.map((e, i) => {
            const a = at.get(e.from)!;
            const b = at.get(e.to)!;
            const [x1, y1] = lr ? [a.x + NODE_W, a.y + NODE_H / 2] : [a.x + NODE_W / 2, a.y + NODE_H];
            const [x2, y2] = lr ? [b.x, b.y + NODE_H / 2] : [b.x + NODE_W / 2, b.y];
            const d = lr ? `M${x1},${y1}C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}` : `M${x1},${y1}C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
            return (
              <g key={i}>
                <path d={d} className="mui-edge" markerEnd={`url(#${id}-arrow)`} />
                {e.label && (
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle" className="mui-axis">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {g.nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <rect width={NODE_W} height={NODE_H} rx={6} className="mui-node" />
              <text x={NODE_W / 2} y={NODE_H / 2 + 4} textAnchor="middle" className="mui-node-label">
                {n.label.length > 20 ? `${n.label.slice(0, 19)}…` : n.label}
              </text>
              <title>{n.label}</title>
            </g>
          ))}
        </svg>
      </div>
      <ActionBar actions={view.actions} scope={data} />
    </Block>
  );
}
