import { useMemo, useState, useEffect, useRef } from 'react';
import { Network } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { ScreenplayElement } from '@/types';

/**
 * Character Relationship Graph.
 *
 * Force-directed network rendered to SVG (no third-party dep — Recharts and
 * the rest of the chart libraries don't ship a graph layout).
 *
 *   - Nodes  = characters who speak in the script. Radius scales with total
 *              line count, so leads are obvious at a glance.
 *   - Edges  = pairs of characters who share at least one scene. Stroke
 *              width scales with shared-scene count.
 *
 * The physics simulation is intentionally tiny: a few iterations of
 * Fruchterman-Reingold-style repulsion plus spring attraction. We stop after
 * ~300 ticks (well under the 60ms budget per frame on a modern laptop) and
 * cache the positions — no animation loop, no jitter.
 *
 * Pure-presentational: reads from the store, dispatches nothing.
 */

interface Node {
  id: string;        // CHARACTER (uppercase)
  lines: number;
  scenes: Set<string>;
  // populated by layout
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Edge {
  a: string;
  b: string;
  weight: number;    // number of shared scenes
  /** Subset of scene IDs the two characters both speak in — for the hover tooltip. */
  scenes: string[];
}

const W = 540;       // viewbox width
const H = 360;       // viewbox height
const MAX_R = 26;    // largest node radius

export default function CharacterGraph() {
  const screenplay = useAppStore((s) => s.screenplay);
  const scenes = useAppStore((s) => s.scenes);
  const setActiveScene = useAppStore((s) => s.setActiveScene);
  const setTab = useAppStore((s) => s.setTab);

  const [hoverEdge, setHoverEdge] = useState<Edge | null>(null);
  const [hoverNode, setHoverNode] = useState<Node | null>(null);
  // Force a re-layout when the underlying data changes meaningfully.
  const layoutKey = useRef(0);

  // ── Build nodes + edges from the screenplay ────────────────────────────
  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!screenplay?.elements) return { nodes: [], edges: [] };

    // 1. For each scene, track which speakers appear in it.
    const sceneSpeakers = new Map<string, Set<string>>();
    let currentSpeaker: string | null = null;
    for (const el of screenplay.elements as ScreenplayElement[]) {
      const text = stripHtml(el.content).trim();
      if (!text) continue;
      if (el.type === 'character') {
        currentSpeaker = text.replace(/\(.+?\)/g, '').trim().toUpperCase();
      } else if (el.type === 'dialogue' && currentSpeaker && el.sceneId) {
        const set = sceneSpeakers.get(el.sceneId) || new Set<string>();
        set.add(currentSpeaker);
        sceneSpeakers.set(el.sceneId, set);
      } else if (el.type === 'scene-heading' || el.type === 'action' || el.type === 'transition') {
        currentSpeaker = null;
      }
    }

    // 2. Build nodes (one per unique speaker) with line counts.
    const nodeMap = new Map<string, Node>();
    currentSpeaker = null;
    for (const el of screenplay.elements as ScreenplayElement[]) {
      if (el.type === 'character') {
        currentSpeaker = stripHtml(el.content).trim().replace(/\(.+?\)/g, '').trim().toUpperCase();
      } else if (el.type === 'dialogue' && currentSpeaker) {
        const n = nodeMap.get(currentSpeaker) || {
          id: currentSpeaker, lines: 0, scenes: new Set<string>(),
          x: 0, y: 0, vx: 0, vy: 0,
        };
        n.lines += 1;
        if (el.sceneId) n.scenes.add(el.sceneId);
        nodeMap.set(currentSpeaker, n);
      } else if (el.type === 'scene-heading' || el.type === 'action' || el.type === 'transition') {
        currentSpeaker = null;
      }
    }

    // 3. Build edges from co-occurring pairs in each scene.
    const edgeMap = new Map<string, Edge>();
    sceneSpeakers.forEach((speakers, sceneId) => {
      const arr = [...speakers].sort();
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = `${arr[i]}|${arr[j]}`;
          const existing = edgeMap.get(key);
          if (existing) {
            existing.weight += 1;
            existing.scenes.push(sceneId);
          } else {
            edgeMap.set(key, { a: arr[i], b: arr[j], weight: 1, scenes: [sceneId] });
          }
        }
      }
    });

    // 4. Seed positions in a circle and run a few force iterations.
    const nodesArr = [...nodeMap.values()];
    if (nodesArr.length === 0) return { nodes: [], edges: [] };
    const edgesArr = [...edgeMap.values()];

    // Deterministic seed using node id hash so the layout is stable across
    // renders without needing Math.random().
    const cx = W / 2;
    const cy = H / 2;
    nodesArr.forEach((n, i) => {
      const angle = (i / nodesArr.length) * Math.PI * 2 + hashCode(n.id) * 0.001;
      const radius = Math.min(W, H) * 0.32;
      n.x = cx + Math.cos(angle) * radius;
      n.y = cy + Math.sin(angle) * radius;
      n.vx = 0; n.vy = 0;
    });

    // Force simulation
    runForceLayout(nodesArr, edgesArr);

    return { nodes: nodesArr, edges: edgesArr };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenplay?.elements, scenes, layoutKey.current]);

  // Clear hover state when the underlying data changes meaningfully.
  useEffect(() => { setHoverNode(null); setHoverEdge(null); }, [nodes.length, edges.length]);

  if (!nodes.length) {
    return (
      <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-muted)] text-center">
        Write dialogue with at least one character to see the relationship graph.
      </div>
    );
  }

  const maxLines = Math.max(...nodes.map((n) => n.lines));
  const maxWeight = Math.max(...edges.map((e) => e.weight), 1);
  const sceneNameById = new Map(scenes.map((s) => [s.id, s.heading || s.name || 'Scene']));

  /** Find the first scene (by `order`) in `sceneIds` and jump the writer to it. */
  const jumpToFirstScene = (sceneIds: Iterable<string>) => {
    const ids = [...sceneIds];
    if (!ids.length) return;
    // scenes are stored unordered; pick the earliest by `order`.
    const ordered = ids
      .map((id) => scenes.find((s) => s.id === id))
      .filter(Boolean)
      .sort((a, b) => (a!.order ?? 0) - (b!.order ?? 0));
    const target = ordered[0];
    if (!target) return;
    setActiveScene(target.id);
    setTab('writer');
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1.5">
          <Network className="w-3 h-3 text-blue-400" /> Character Relationships
        </h3>
        <span className="text-[10px] text-[var(--text-muted)]">
          {nodes.length} character{nodes.length === 1 ? '' : 's'} · {edges.length} relationship{edges.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="relative rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
          {/* Edges first so nodes sit on top */}
          {edges.map((e) => {
            const a = nodes.find((n) => n.id === e.a);
            const b = nodes.find((n) => n.id === e.b);
            if (!a || !b) return null;
            const isHover = hoverEdge === e;
            const isAdjacentToHoveredNode = hoverNode && (hoverNode.id === e.a || hoverNode.id === e.b);
            const stroke = isHover || isAdjacentToHoveredNode ? '#60a5fa' : 'rgba(120, 130, 145, 0.4)';
            const sw = 0.8 + (e.weight / maxWeight) * 3.5;
            return (
              <g key={`${e.a}-${e.b}`}>
                {/* Wider invisible hit area so thin edges are clickable. */}
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={stroke}
                  strokeWidth={Math.max(sw, 8)}
                  strokeOpacity={0}
                  strokeLinecap="round"
                  onMouseEnter={() => setHoverEdge(e)}
                  onMouseLeave={() => setHoverEdge(null)}
                  onClick={() => jumpToFirstScene(e.scenes)}
                  className="cursor-pointer"
                />
                {/* The visible stroke. pointer-events: none so hover/click
                    always hit the wider transparent line above. */}
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={stroke}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }}
                  className="transition-all"
                ><title>{`${e.a} ↔ ${e.b} — share ${e.weight} scene${e.weight === 1 ? '' : 's'} — click to jump`}</title></line>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const r = 8 + (n.lines / maxLines) * (MAX_R - 8);
            const isHover = hoverNode === n;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onMouseEnter={() => setHoverNode(n)}
                onMouseLeave={() => setHoverNode(null)}
                onClick={() => jumpToFirstScene(n.scenes)}
                className="cursor-pointer"
              >
                <circle
                  r={r}
                  fill={isHover ? '#a78bfa' : '#8b5cf6'}
                  stroke={isHover ? '#fff' : 'rgba(255,255,255,0.18)'}
                  strokeWidth={isHover ? 1.5 : 1}
                  opacity={0.92}
                />
                <text
                  textAnchor="middle"
                  y={r + 11}
                  fontSize={10}
                  fontWeight="bold"
                  fill="currentColor"
                  className="text-[var(--text)] select-none"
                  style={{ pointerEvents: 'none' }}
                >
                  {n.id}
                </text>
                <title>{`${n.id} — ${n.lines} line${n.lines === 1 ? '' : 's'} in ${n.scenes.size} scene${n.scenes.size === 1 ? '' : 's'} — click to jump`}</title>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip strip */}
      <div className="text-[11px] text-[var(--text-secondary)] min-h-[1.5em]">
        {hoverEdge ? (
          <>
            <strong>{hoverEdge.a} ↔ {hoverEdge.b}</strong>
            {' — share '}
            {hoverEdge.weight} scene{hoverEdge.weight === 1 ? '' : 's'}
            {hoverEdge.scenes.length > 0 && (
              <span className="text-[var(--text-muted)]">
                {' · '}
                {hoverEdge.scenes
                  .slice(0, 3)
                  .map((id) => sceneNameById.get(id) || '?')
                  .join(' · ')}
                {hoverEdge.scenes.length > 3 ? ` … (+${hoverEdge.scenes.length - 3})` : ''}
              </span>
            )}
          </>
        ) : hoverNode ? (
          <>
            <strong>{hoverNode.id}</strong>
            {' — '}{hoverNode.lines} line{hoverNode.lines === 1 ? '' : 's'} across {hoverNode.scenes.size} scene{hoverNode.scenes.size === 1 ? '' : 's'}
          </>
        ) : (
          <span className="text-[var(--text-muted)]">Hover a node or edge for detail · larger nodes = more dialogue · thicker edges = more shared scenes</span>
        )}
      </div>
    </section>
  );
}

// ─── Force layout ───────────────────────────────────────────────────────────
//
// Quick & dirty Fruchterman-Reingold variant: every pair of nodes repels,
// every edge attracts, a weak gravity pulls towards centre, and we cool over
// time. ~300 iterations finish well under 16ms on the kind of graphs a
// screenplay produces (typically <30 characters).
function runForceLayout(nodes: Node[], edges: Edge[]) {
  if (nodes.length <= 1) return;
  const cx = W / 2;
  const cy = H / 2;
  const area = W * H;
  const k = Math.sqrt(area / nodes.length) * 0.85;
  const iterations = 300;

  for (let iter = 0; iter < iterations; iter++) {
    // Temperature shrinks over time so nodes settle.
    const t = (1 - iter / iterations) * 10;

    // Repulsive forces (all pairs).
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].vx = 0;
      nodes[i].vy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        nodes[i].vx += (dx / dist) * force;
        nodes[i].vy += (dy / dist) * force;
      }
    }

    // Attractive forces along edges.
    for (const e of edges) {
      const a = nodes.find((n) => n.id === e.a);
      const b = nodes.find((n) => n.id === e.b);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      // Weighted edges pull a little tighter.
      const force = (dist * dist) / k * Math.sqrt(e.weight);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }

    // Gentle gravity towards centre so disconnected nodes don't drift off.
    for (const n of nodes) {
      n.vx += (cx - n.x) * 0.02;
      n.vy += (cy - n.y) * 0.02;
    }

    // Apply velocities, clamped by temperature, clipped to viewbox.
    for (const n of nodes) {
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy) || 0.01;
      n.x += (n.vx / speed) * Math.min(speed, t);
      n.y += (n.vy / speed) * Math.min(speed, t);
      n.x = Math.max(MAX_R + 4, Math.min(W - MAX_R - 4, n.x));
      n.y = Math.max(MAX_R + 4, Math.min(H - MAX_R - 16, n.y));
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  return (html || '').replace(/<[^>]+>/g, '');
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
