import { useEffect, useMemo, useRef } from "react";
import type { GraphDataset, LayoutNodePosition } from "../types/graph";
import { MAP_ZONES, NODE_COLORS, colorToCss } from "../lib/graph-config";
import { isMapConnection } from "../../../shared/graph-schema/edge-evidence.mjs";

export interface Camera { x: number; y: number; scale: number }

interface Props {
  graph: GraphDataset;
  positions: Record<string, LayoutNodePosition>;
  camera: Camera;
  selectedId?: string;
  scopeZone: string;
  onCamera: (camera: Camera) => void;
  onSelect: (id: string) => void;
}

export function MapCanvas({ graph, positions, camera, selectedId, scopeZone, onCamera, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined);
  const visibleIds = useMemo(() => {
    if (scopeZone === "all") return new Set(graph.nodes.map((node) => node.id));
    const ids = new Set(graph.nodes.filter((node) => node.zone === scopeZone).map((node) => node.id));
    const neighbors = new Set(ids);
    for (const edge of graph.edges) {
      if (!isMapConnection(edge)) continue;
      if (ids.has(edge.source)) neighbors.add(edge.target);
      if (ids.has(edge.target)) neighbors.add(edge.source);
    }
    if (selectedId) neighbors.add(selectedId);
    return neighbors;
  }, [graph, scopeZone, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const point = (x: number, y: number) => ({
        x: rect.width / 2 + (x - camera.x) * camera.scale,
        y: rect.height / 2 + (y - camera.y) * camera.scale,
      });

      for (const zone of MAP_ZONES) {
        if (scopeZone !== "all" && scopeZone !== zone.id) continue;
        const a = point(zone.x, zone.y);
        context.strokeStyle = zone.id === scopeZone ? "rgba(135, 185, 169, .28)" : "rgba(225, 208, 191, .1)";
        context.lineWidth = 1;
        context.strokeRect(a.x, a.y, zone.width * camera.scale, zone.height * camera.scale);
        context.fillStyle = "rgba(225, 208, 191, .38)";
        context.font = "600 10px Inter, Segoe UI, sans-serif";
        context.fillText(zone.label, a.x + 10, a.y + 17);
      }

      context.lineWidth = 1;
      for (const edge of graph.edges) {
        if (!isMapConnection(edge)) continue;
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        const source = positions[edge.source];
        const target = positions[edge.target];
        if (!source || !target) continue;
        const a = point(source.x, source.y);
        const b = point(target.x, target.y);
        if ((a.x < -30 && b.x < -30) || (a.x > rect.width + 30 && b.x > rect.width + 30) ||
            (a.y < -30 && b.y < -30) || (a.y > rect.height + 30 && b.y > rect.height + 30)) continue;
        const active = edge.source === selectedId || edge.target === selectedId;
        context.strokeStyle = active ? "rgba(230, 199, 108, .68)" : "rgba(203, 193, 177, .14)";
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }

      for (const node of graph.nodes) {
        if (!visibleIds.has(node.id)) continue;
        const position = positions[node.id];
        if (!position) continue;
        const p = point(position.x, position.y);
        if (p.x < -170 || p.x > rect.width + 170 || p.y < -40 || p.y > rect.height + 40) continue;
        const selected = node.id === selectedId;
        const muted = scopeZone !== "all" && node.zone !== scopeZone;
        context.globalAlpha = muted && !selected ? 0.38 : 1;
        context.fillStyle = colorToCss(NODE_COLORS[node.type]);
        context.beginPath();
        if (node.type === "band") context.roundRect(p.x - 5, p.y - 4, 10, 8, 2);
        else if (node.type === "genre") context.roundRect(p.x - 8, p.y - 4, 16, 8, 4);
        else context.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        context.fill();
        if (selected) {
          context.strokeStyle = "#f4db8f";
          context.lineWidth = 2;
          context.beginPath();
          context.arc(p.x, p.y, 10, 0, Math.PI * 2);
          context.stroke();
        }
        if (camera.scale > 0.12 || selected) {
          context.fillStyle = "#ece5db";
          context.font = selected ? "700 11px Inter, Segoe UI, sans-serif" : "10px Inter, Segoe UI, sans-serif";
          context.textAlign = "center";
          context.fillText(node.label, p.x, p.y + 17, 205);
        }
        context.globalAlpha = 1;
      }
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [graph, positions, camera, selectedId, scopeZone, visibleIds]);

  function selectAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let nearest: { id: string; distance: number } | undefined;
    for (const node of graph.nodes) {
      if (!visibleIds.has(node.id)) continue;
      const position = positions[node.id];
      if (!position) continue;
      const x = rect.width / 2 + (position.x - camera.x) * camera.scale;
      const y = rect.height / 2 + (position.y - camera.y) * camera.scale;
      const distance = Math.hypot(x - (clientX - rect.left), y - (clientY - rect.top));
      if (distance < 15 && (!nearest || distance < nearest.distance)) nearest = { id: node.id, distance };
    }
    if (nearest) onSelect(nearest.id);
  }

  return <canvas
    ref={canvasRef}
    className="lab-canvas"
    aria-label="Interactive comparison map"
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, moved: false };
    }}
    onPointerMove={(event) => {
      if (!drag.current) return;
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
      drag.current.x = event.clientX;
      drag.current.y = event.clientY;
      onCamera({ ...camera, x: camera.x - dx / camera.scale, y: camera.y - dy / camera.scale });
    }}
    onPointerUp={(event) => {
      if (!drag.current?.moved) selectAt(event.clientX, event.clientY);
      drag.current = undefined;
    }}
    onWheel={(event) => {
      const scale = Math.min(1.8, Math.max(0.06, camera.scale * (event.deltaY > 0 ? 0.88 : 1.12)));
      onCamera({ ...camera, scale });
    }}
  />;
}
