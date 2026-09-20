import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Text,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  MAP_ZONES,
  NODE_COLORS,
  colorToCss,
} from "../lib/graph-config";
import type {
  GraphEdge,
  GraphNode,
  LayoutMode,
  LayoutNodePosition,
  MapMode,
  NodeType,
} from "../types/graph";

export interface GraphMapHandle {
  fit(): void;
  focus(nodeId: string): void;
  home(): void;
  zoomBy(factor: number): void;
}

interface GraphMapProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode: MapMode;
  selectedId?: string;
  routeNodeIds?: string[];
  visibleTypes: Set<NodeType>;
  layoutMode: LayoutMode;
  layoutPositions?: Record<string, LayoutNodePosition>;
  onSelect(node: GraphNode): void;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

type VisualMode = "detail" | "map" | "overview";

interface NodeVisualItem {
  node: GraphNode;
  container: Container;
  shape: Graphics;
  label: Text;
  alwaysLabel: boolean;
  hubLabel: boolean;
  overviewLabel: boolean;
  hovered: boolean;
}

interface EdgeVisualItem {
  edge: GraphEdge;
  source: GraphNode;
  target: GraphNode;
}

const MIN_ZOOM = 0.24;
const MOBILE_MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.55;
const EMPTY_ROUTE_NODE_IDS: string[] = [];

const MOBILE_HOME_CAMERA: Record<MapMode, Camera> = {
  artists: { x: -180, y: -180, zoom: 0.68 },
  guitars: { x: 640, y: 20, zoom: 0.64 },
};

const DESKTOP_HOME_CAMERA: Record<MapMode, Camera> = {
  artists: { x: 210, y: 170, zoom: 0.56 },
  guitars: { x: 1530, y: 70, zoom: 0.44 },
};

function edgeKey(source: string, target: string): string {
  return [source, target].sort().join("|");
}

function destroyChildren(container: Container) {
  container.removeChildren().forEach((child) => child.destroy({ children: true }));
}

function trace(
  graphics: Graphics,
  source: GraphNode,
  target: GraphNode,
  color: number,
  alpha: number,
  width: number,
) {
  const horizontalFirst = Math.abs(target.x - source.x) > Math.abs(target.y - source.y);
  graphics.moveTo(source.x, source.y);

  if (horizontalFirst) {
    const midX = source.x + (target.x - source.x) * 0.52;
    graphics.lineTo(midX, source.y);
    graphics.lineTo(midX, target.y);
  } else {
    const midY = source.y + (target.y - source.y) * 0.52;
    graphics.lineTo(source.x, midY);
    graphics.lineTo(target.x, midY);
  }

  graphics.lineTo(target.x, target.y);
  graphics.stroke({ color, alpha, width });
}

function nodeRadius(node: GraphNode): number {
  if (node.type === "genre") return 18;
  if (node.type === "band" || node.type === "guitar_brand") return 14;
  if (node.type === "guitar") return 12;
  return 10;
}

function visualModeForZoom(zoom: number): VisualMode {
  if (zoom <= 0.32) return "overview";
  if (zoom <= 0.56) return "map";
  return "detail";
}

function screenWidth(worldZoom: number, pixels: number, maxWorld = 10): number {
  return Math.min(maxWorld, Math.max(pixels, pixels / Math.max(worldZoom, 0.16)));
}

function nodeScaleForMode(node: GraphNode, visualMode: VisualMode, hubLabel: boolean): number {
  if (visualMode === "detail") return 1;
  if (node.type === "genre") return visualMode === "overview" ? 1.22 : 1.1;
  if (hubLabel) return visualMode === "overview" ? 1.16 : 1.08;
  return visualMode === "overview" ? 1.08 : 1.03;
}

function drawNodeShape(
  graphics: Graphics,
  node: GraphNode,
  emphasized: boolean,
  zoom = 1,
  visualMode: VisualMode = "detail",
  hubLabel = false,
) {
  graphics.clear();
  const color = NODE_COLORS[node.type];
  const radius = nodeRadius(node) * nodeScaleForMode(node, visualMode, hubLabel);
  const outline = screenWidth(zoom, emphasized ? 3.2 : visualMode === "detail" ? 1.8 : 2.2, 9);
  const innerLine = screenWidth(zoom, 1.1, 5);
  const fillAlpha = visualMode === "overview" && !hubLabel && node.type !== "genre" ? 0.9 : 0.96;

  if (node.type === "genre") {
    graphics.roundRect(-radius * 2.7, -radius, radius * 5.4, radius * 2, 18);
    graphics.fill({ color: 0x11110f, alpha: 0.94 });
    graphics.stroke({ color, alpha: emphasized ? 1 : 0.82, width: outline });
    return;
  }

  if (node.type === "band") {
    graphics.roundRect(-radius * 1.6, -radius, radius * 3.2, radius * 2, 8);
    graphics.fill({ color: 0x11110f, alpha: fillAlpha });
    graphics.stroke({ color, alpha: emphasized ? 1 : 0.84, width: outline });
    return;
  }

  if (node.type === "guitar_brand") {
    graphics.rect(-radius * 1.65, -radius, radius * 3.3, radius * 2);
    graphics.fill({ color: 0x11110f, alpha: fillAlpha });
    graphics.stroke({ color, alpha: 0.88, width: outline });
    graphics.rect(-radius * 1.35, -radius * 0.7, radius * 2.7, radius * 1.4);
    graphics.stroke({ color, alpha: 0.45, width: innerLine });
    return;
  }

  if (node.type === "guitar") {
    graphics.rect(-radius * 1.4, -radius * 0.75, radius * 2.8, radius * 1.5);
    graphics.fill({ color: 0x11110f, alpha: fillAlpha });
    graphics.stroke({ color, alpha: 0.88, width: outline });
    graphics.moveTo(radius * 1.4, 0);
    graphics.lineTo(radius * 2.15, 0);
    graphics.stroke({ color, alpha: 0.78, width: screenWidth(zoom, 1.8, 7) });
    return;
  }

  graphics.circle(0, 0, radius);
  graphics.fill({ color, alpha: emphasized ? 1 : 0.88 });
  graphics.circle(0, 0, radius + screenWidth(zoom, 3.2, 8));
  graphics.stroke({ color, alpha: emphasized ? 0.9 : 0.46, width: outline });
}

export const GraphMap = forwardRef<GraphMapHandle, GraphMapProps>(
  function GraphMap(
    {
      nodes,
      edges,
      mode,
      selectedId,
      routeNodeIds = EMPTY_ROUTE_NODE_IDS,
      visibleTypes,
      layoutMode,
      layoutPositions,
      onSelect,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const viewportRef = useRef<Viewport | null>(null);
    const worldRef = useRef<Viewport | null>(null);
    const selectionLayerRef = useRef<Container | null>(null);
    const cameraFrameRef = useRef<number | null>(null);
    const layoutFrameRef = useRef<number | null>(null);
    const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 0.42 });
    const nodesRef = useRef(nodes);
    const onSelectRef = useRef(onSelect);
    const visibleTypesRef = useRef(visibleTypes);
    const layoutPositionsRef = useRef(layoutPositions);
    const nodePositionRef = useRef(new Map<string, { x: number; y: number }>());
    const nodeVisualItemsRef = useRef<NodeVisualItem[]>([]);
    const edgeVisualItemsRef = useRef<EdgeVisualItem[]>([]);
    const edgeLayerRef = useRef<Graphics | null>(null);
    const visualModeRef = useRef<VisualMode>("detail");
    const visualZoomRef = useRef(0);
    const [ready, setReady] = useState(false);

    nodesRef.current = nodes;
    onSelectRef.current = onSelect;
    visibleTypesRef.current = visibleTypes;
    layoutPositionsRef.current = layoutPositions;

    function isCompactMap() {
      const host = hostRef.current;
      return (
        (host?.clientWidth ?? window.innerWidth) <= 760 ||
        window.matchMedia("(pointer: coarse)").matches
      );
    }

    function minZoom() {
      return isCompactMap() ? MOBILE_MIN_ZOOM : MIN_ZOOM;
    }

    function clampZoom(zoom: number) {
      return Math.max(minZoom(), Math.min(MAX_ZOOM, zoom));
    }

    function redrawEdges(camera = cameraRef.current, visualMode = visualModeForZoom(camera.zoom)) {
      const edgeLayer = edgeLayerRef.current;
      if (!edgeLayer) return;

      edgeLayer.clear();
      edgeVisualItemsRef.current.forEach(({ edge, source, target }) => {
        const isOverview = visualMode === "overview";
        const isMap = visualMode === "map";
        const minimumStrength = isOverview ? 0.72 : 0.64;
        if (edge.strength < minimumStrength) return;

        const targetPixels = isOverview ? 1.8 : isMap ? 1.55 : 1.25;
        trace(
          edgeLayer,
          source,
          target,
          0xcabbb1,
          isOverview ? 0.24 : isMap ? 0.2 : 0.18,
          screenWidth(camera.zoom, targetPixels, 8),
        );
      });
    }

    function redrawNodes(camera = cameraRef.current, visualMode = visualModeForZoom(camera.zoom)) {
      nodeVisualItemsRef.current.forEach((item) => {
        drawNodeShape(
          item.shape,
          item.node,
          false,
          camera.zoom,
          visualMode,
          item.hubLabel,
        );
      });
    }

    function syncLabelReadability(camera = cameraRef.current) {
      const app = appRef.current;
      const compact = isCompactMap();
      const visualMode = visualModeForZoom(camera.zoom);
      const targetScreenScale = compact ? 0.86 : visualMode === "detail" ? 1 : visualMode === "map" ? 0.72 : 0.62;
      const labelScale = Math.min(compact ? 2.45 : 1.95, Math.max(1, targetScreenScale / camera.zoom));
      const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
      const candidates: Array<{
        item: NodeVisualItem;
        alpha: number;
        priority: number;
      }> = [];

      nodeVisualItemsRef.current.forEach((item) => {
        const showMapLabel =
          item.alwaysLabel ||
          (item.hubLabel && (camera.zoom >= 0.44 || item.node.type === "genre" || item.node.starter));
        const showOverviewLabel = item.node.type === "genre" || item.node.starter || item.overviewLabel;
        const visible =
          visualMode === "detail"
            ? true
            : visualMode === "map"
              ? showMapLabel
              : showOverviewLabel;

        item.label.scale.set(labelScale);
        item.label.position.set(
          item.node.x,
          item.node.y + Math.max(nodeRadius(item.node) + 12, 18 / camera.zoom),
        );

        if (item.hovered) {
          item.label.alpha = 1;
          candidates.push({ item, alpha: 1, priority: 1000 });
          return;
        }

        item.label.alpha = 0;
        if (!visible) return;

        const degreePriority = item.overviewLabel ? 28 : item.hubLabel ? 16 : 0;
        const typePriority =
          item.node.type === "genre" ? 90 :
          item.node.starter ? 84 :
          item.node.type === "guitar_brand" ? 58 :
          item.node.type === "guitarist" ? 42 :
          item.node.type === "artist" ? 36 :
          item.node.type === "band" ? 30 :
          24;
        const selectedPriority = item.node.id === selectedId ? 500 : 0;
        candidates.push({
          item,
          alpha: visualMode === "overview" ? 0.84 : 0.95,
          priority: selectedPriority + typePriority + degreePriority,
        });
      });

      candidates
        .sort((a, b) => b.priority - a.priority || a.item.node.label.localeCompare(b.item.node.label))
        .forEach(({ item, alpha }) => {
          if (!app) {
            item.label.alpha = alpha;
            return;
          }

          const screenX = (item.node.x - camera.x) * camera.zoom + app.screen.width / 2;
          const screenY = (item.label.y - camera.y) * camera.zoom + app.screen.height / 2;
          const width = Math.min(170, Math.max(44, item.label.width * camera.zoom));
          const height = Math.min(72, Math.max(16, item.label.height * camera.zoom));
          const padding = visualMode === "detail" ? 5 : 8;
          const box = {
            left: screenX - width / 2 - padding,
            right: screenX + width / 2 + padding,
            top: screenY - padding,
            bottom: screenY + height + padding,
          };
          const offscreen =
            box.right < -40 ||
            box.left > app.screen.width + 40 ||
            box.bottom < -40 ||
            box.top > app.screen.height + 40;
          const overlaps = occupied.some((other) =>
            box.left < other.right &&
            box.right > other.left &&
            box.top < other.bottom &&
            box.bottom > other.top,
          );

          if (!offscreen && !overlaps) {
            occupied.push(box);
            item.label.alpha = alpha;
          }
        });
    }

    function syncMapReadability(camera = cameraRef.current, force = false) {
      const visualMode = visualModeForZoom(camera.zoom);
      const zoomDelta = Math.abs(camera.zoom - visualZoomRef.current) / Math.max(camera.zoom, 0.1);
      const shouldRedraw = force || visualModeRef.current !== visualMode || zoomDelta > 0.08;

      if (shouldRedraw) {
        visualModeRef.current = visualMode;
        visualZoomRef.current = camera.zoom;
        redrawEdges(camera, visualMode);
        redrawNodes(camera, visualMode);
      }

      syncLabelReadability(camera);
    }

    function applyCamera(camera = cameraRef.current) {
      const app = appRef.current;
      const viewport = viewportRef.current;
      if (!app || !viewport) return;
      syncMapReadability(camera, true);
      viewport.resize(app.screen.width, app.screen.height);
      viewport.setZoom(camera.zoom, false);
      viewport.moveCenter(camera.x, camera.y);
      app.render();
    }

    function renderFrame() {
      appRef.current?.render();
    }

    function scheduleCameraApply() {
      if (cameraFrameRef.current !== null) return;
      cameraFrameRef.current = window.requestAnimationFrame(() => {
        cameraFrameRef.current = null;
        applyCamera();
      });
    }

    function targetPositionFor(node: GraphNode) {
      const layoutPosition = layoutPositionsRef.current?.[node.id];
      return {
        x: layoutPosition?.x ?? node.x,
        y: layoutPosition?.y ?? node.y,
      };
    }

    function displayPositionFor(node: GraphNode) {
      return nodePositionRef.current.get(node.id) ?? targetPositionFor(node);
    }

    function setVisualPosition(item: NodeVisualItem, x: number, y: number) {
      item.node.x = x;
      item.node.y = y;
      item.container.position.set(x, y);
      item.label.position.set(
        x,
        y + Math.max(nodeRadius(item.node) + 12, 18 / Math.max(cameraRef.current.zoom, 0.16)),
      );
      nodePositionRef.current.set(item.node.id, { x, y });
    }

    function animateToLayout(instant = false) {
      if (!ready || !nodeVisualItemsRef.current.length) return;
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }

      const items = nodeVisualItemsRef.current.map((item) => {
        const target = targetPositionFor(item.node);
        return {
          item,
          startX: item.node.x,
          startY: item.node.y,
          targetX: target.x,
          targetY: target.y,
        };
      });

      if (instant) {
        items.forEach(({ item, targetX, targetY }) => setVisualPosition(item, targetX, targetY));
        syncMapReadability(cameraRef.current, true);
        renderFrame();
        return;
      }

      const start = performance.now();
      const duration = 760;
      const step = (now: number) => {
        const raw = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - raw, 3);

        items.forEach(({ item, startX, startY, targetX, targetY }) => {
          setVisualPosition(
            item,
            startX + (targetX - startX) * eased,
            startY + (targetY - startY) * eased,
          );
        });

        syncMapReadability(cameraRef.current, true);
        renderFrame();

        if (raw < 1) {
          layoutFrameRef.current = window.requestAnimationFrame(step);
        } else {
          layoutFrameRef.current = null;
        }
      };

      layoutFrameRef.current = window.requestAnimationFrame(step);
    }

    function visibleNodes() {
      return nodesRef.current.filter((node) => visibleTypes.has(node.type));
    }

    function syncCameraFromViewport() {
      const viewport = viewportRef.current;
      if (!viewport) return;
      cameraRef.current = {
        x: viewport.center.x,
        y: viewport.center.y,
        zoom: viewport.scale.x,
      };
      syncMapReadability(cameraRef.current);
    }

    function pickNodeAtWorld(x: number, y: number) {
      let closest: { node: GraphNode; distance: number } | undefined;

      nodesRef.current.forEach((node) => {
        if (!visibleTypesRef.current.has(node.type)) return;

        const position = displayPositionFor(node);
        const dx = x - position.x;
        const dy = y - position.y;
        const radius = Math.max(22, nodeRadius(node) + 12 / cameraRef.current.zoom);
        const onMarker = Math.hypot(dx, dy) <= radius;
        const onLabel = Math.abs(dx) <= 90 / cameraRef.current.zoom && dy >= 4 && dy <= 52 / cameraRef.current.zoom;

        if (!onMarker && !onLabel) return;

        const distance = Math.hypot(dx, dy);
        if (!closest || distance < closest.distance) {
          closest = { node, distance };
        }
      });

      return closest?.node;
    }

    function fitMap() {
      const app = appRef.current;
      const list = visibleNodes();
      if (!app || !list.length) return;

      if (isCompactMap()) {
        cameraRef.current = {
          ...MOBILE_HOME_CAMERA[mode],
          zoom: clampZoom(MOBILE_HOME_CAMERA[mode].zoom),
        };
        applyCamera();
        return;
      }

      const zones = MAP_ZONES.filter((zone) => zone.mode === mode);
      const minX = Math.min(
        ...list.map((node) => displayPositionFor(node).x),
        ...zones.map((zone) => zone.x),
      );
      const maxX = Math.max(
        ...list.map((node) => displayPositionFor(node).x),
        ...zones.map((zone) => zone.x + zone.width),
      );
      const minY = Math.min(
        ...list.map((node) => displayPositionFor(node).y),
        ...zones.map((zone) => zone.y),
      );
      const maxY = Math.max(
        ...list.map((node) => displayPositionFor(node).y),
        ...zones.map((zone) => zone.y + zone.height),
      );

      const availableWidth = Math.max(500, app.screen.width - (app.screen.width > 900 ? 400 : 80));
      const availableHeight = Math.max(400, app.screen.height - 180);
      const zoom = Math.max(
        minZoom(),
        Math.min(MAX_ZOOM, availableWidth / (maxX - minX + 260), availableHeight / (maxY - minY + 260)),
      );

      cameraRef.current = {
        x: (minX + maxX) / 2 - (app.screen.width > 900 ? 100 / zoom : 0),
        y: (minY + maxY) / 2,
        zoom,
      };
      applyCamera();
    }

    function homeMap() {
      const home = isCompactMap() ? MOBILE_HOME_CAMERA[mode] : DESKTOP_HOME_CAMERA[mode];
      cameraRef.current = {
        ...home,
        zoom: clampZoom(home.zoom),
      };
      applyCamera();
    }

    function focusNode(nodeId: string) {
      const node = nodesRef.current.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      const position = displayPositionFor(node);
      cameraRef.current = {
        x: position.x + (window.innerWidth > 980 ? 190 : 0),
        y: position.y,
        zoom: clampZoom(window.innerWidth > 700 ? 0.92 : 0.86),
      };
      applyCamera();
    }

    function zoomBy(factor: number) {
      cameraRef.current = {
        ...cameraRef.current,
        zoom: clampZoom(cameraRef.current.zoom * factor),
      };
      scheduleCameraApply();
    }

    useImperativeHandle(ref, () => ({ fit: fitMap, focus: focusNode, home: homeMap, zoomBy }));

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      let disposed = false;
      let initialized = false;
      let tickViewport: (() => void) | undefined;
      const app = new Application();

      void app
        .init({
          resizeTo: host,
          autoStart: true,
          preference: "webgl",
          powerPreference: "high-performance",
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          backgroundAlpha: 0,
        })
        .then(() => {
          initialized = true;
          if (disposed) {
            app.destroy(true);
            return;
          }

          host.appendChild(app.canvas);
          const viewport = new Viewport({
            screenWidth: app.screen.width,
            screenHeight: app.screen.height,
            events: app.renderer.events,
            passiveWheel: false,
            stopPropagation: true,
            noTicker: true,
            forceHitArea: new Rectangle(-100000, -100000, 200000, 200000),
          });
          tickViewport = () => viewport.update(app.ticker.elapsedMS);
          app.ticker.add(tickViewport);
          viewport
            .drag({ mouseButtons: "left" })
            .pinch()
            .wheel({ percent: 0.08, smooth: 4 })
            .decelerate({ friction: 0.92 })
            .clampZoom({ minScale: minZoom(), maxScale: MAX_ZOOM });
          viewport.on("clicked", (event) => {
            const node = pickNodeAtWorld(event.world.x, event.world.y);
            if (node) onSelectRef.current(node);
          });
          viewport.on("moved", syncCameraFromViewport);
          viewport.on("zoomed", syncCameraFromViewport);
          viewport.on("drag-start", () => {
            host.dataset.dragging = "true";
          });
          viewport.on("drag-end", () => {
            host.dataset.dragging = "false";
          });
          viewport.on("pinch-start", () => {
            host.dataset.dragging = "true";
          });
          viewport.on("pinch-end", () => {
            host.dataset.dragging = "false";
          });
          app.stage.addChild(viewport);
          appRef.current = app;
          viewportRef.current = viewport;
          worldRef.current = viewport;
          setReady(true);
        });

      return () => {
        disposed = true;
        setReady(false);
        appRef.current = null;
        viewportRef.current = null;
        worldRef.current = null;
        if (cameraFrameRef.current !== null) {
          window.cancelAnimationFrame(cameraFrameRef.current);
          cameraFrameRef.current = null;
        }
        if (layoutFrameRef.current !== null) {
          window.cancelAnimationFrame(layoutFrameRef.current);
          layoutFrameRef.current = null;
        }
        if (tickViewport) {
          app.ticker.remove(tickViewport);
          tickViewport = undefined;
        }
        if (initialized) {
          app.destroy(true, { children: true });
        }
      };
    }, []);

    useEffect(() => {
      if (!ready) return;
      const app = appRef.current;
      if (!app) return;

      const onResize = () => {
        viewportRef.current?.resize(app.screen.width, app.screen.height);
        viewportRef.current?.clampZoom({ minScale: minZoom(), maxScale: MAX_ZOOM });
        applyCamera();
      };
      app.renderer.on("resize", onResize);
      return () => {
        app.renderer?.off?.("resize", onResize);
      };
    }, [ready]);

    useEffect(() => {
      if (!ready) return;
      const app = appRef.current;
      const world = worldRef.current;
      if (!app || !world) return;

      destroyChildren(world);
      selectionLayerRef.current = null;
      edgeLayerRef.current = null;
      nodeVisualItemsRef.current = [];
      edgeVisualItemsRef.current = [];
      nodePositionRef.current = new Map();

      const shownNodes = nodes.filter((node) => visibleTypes.has(node.type));
      const shownIds = new Set(shownNodes.map((node) => node.id));
      const positionedNodes = shownNodes.map((node) => {
        const position = targetPositionFor(node);
        const copy = { ...node, x: position.x, y: position.y };
        nodePositionRef.current.set(node.id, position);
        return copy;
      });
      const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));
      const degreeById = new Map<string, number>();
      edges.forEach((edge) => {
        if (!shownIds.has(edge.source) || !shownIds.has(edge.target)) return;
        degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
        degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
      });

      const grid = new Graphics();
      const graphMinX = Math.min(...positionedNodes.map((node) => node.x), -1800) - 900;
      const graphMaxX = Math.max(...positionedNodes.map((node) => node.x), 3800) + 900;
      const graphMinY = Math.min(...positionedNodes.map((node) => node.y), -1400) - 900;
      const graphMaxY = Math.max(...positionedNodes.map((node) => node.y), 1700) + 900;
      viewportRef.current?.resize(
        app.screen.width,
        app.screen.height,
        graphMaxX - graphMinX,
        graphMaxY - graphMinY,
      );

      for (let x = Math.floor(graphMinX / 100) * 100; x <= graphMaxX; x += 100) {
        grid.moveTo(x, graphMinY).lineTo(x, graphMaxY);
      }
      for (let y = Math.floor(graphMinY / 100) * 100; y <= graphMaxY; y += 100) {
        grid.moveTo(graphMinX, y).lineTo(graphMaxX, y);
      }
      grid.stroke({ color: 0xcabbb1, alpha: 0.045, width: 1 });
      world.addChild(grid);

      const zoneLayer = new Container();
      const connectionLayer = new Container();
      const nodeLayer = new Container();
      const labelLayer = new Container();
      world.addChild(zoneLayer, connectionLayer, nodeLayer, labelLayer);

      MAP_ZONES.filter((zone) => zone.mode === mode).forEach((zone) => {
        const zoneGraphic = new Graphics();
        zoneGraphic.rect(zone.x, zone.y, zone.width, zone.height);
        zoneGraphic.fill({ color: 0x0d0d0b, alpha: 0.16 });
        zoneGraphic.stroke({ color: zone.color, alpha: 0.22, width: 2 });
        zoneLayer.addChild(zoneGraphic);

        const zoneLabel = new Text({
          text: zone.label,
          style: {
            fill: zone.color,
            fontFamily: "Arial, sans-serif",
            fontSize: 18,
            fontWeight: "700",
            letterSpacing: 3,
          },
        });
        zoneLabel.alpha = 0.58;
        zoneLabel.eventMode = "none";
        zoneLabel.position.set(zone.x + 22, zone.y + 18);
        zoneLayer.addChild(zoneLabel);
      });

      const edgeLayer = new Graphics();
      edgeLayerRef.current = edgeLayer;
      edges.forEach((edge) => {
        if (!shownIds.has(edge.source) || !shownIds.has(edge.target)) return;
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return;

        const primary = edge.strength >= 0.64;
        if (!primary) return;

        edgeVisualItemsRef.current.push({ edge, source, target });
      });
      connectionLayer.addChild(edgeLayer);

      positionedNodes.forEach((node) => {
        const nodeContainer = new Container();
        nodeContainer.position.set(node.x, node.y);
        nodeContainer.eventMode = "static";
        nodeContainer.cursor = "pointer";
        nodeContainer.hitArea = new Rectangle(-38, -28, 76, 70);

        const shape = new Graphics();
        nodeContainer.addChild(shape);

        const degree = degreeById.get(node.id) ?? 0;
        const alwaysLabel = Boolean(node.type === "genre" || node.type === "guitar_brand" || node.starter);
        const hubLabel = Boolean(node.starter || node.type === "genre" || degree >= 3);
        const overviewLabel = Boolean(node.starter || node.type === "genre" || degree >= 7);
        const label = new Text({
          text: node.label,
          style: {
            fill: 0xe6d9cc,
            fontFamily: "Arial, sans-serif",
            fontSize: alwaysLabel ? 18 : 15,
            fontWeight: alwaysLabel ? "700" : "500",
            align: "center",
            wordWrap: true,
            wordWrapWidth: 150,
          },
        });
        label.anchor.set(0.5, 0);
        label.eventMode = "none";
        label.position.set(node.x, node.y + nodeRadius(node) + 12);
        label.alpha = alwaysLabel ? 0.95 : 0;
        labelLayer.addChild(label);
        const visualItem = {
          label,
          node,
          container: nodeContainer,
          shape,
          alwaysLabel,
          hubLabel,
          overviewLabel,
          hovered: false,
        };
        nodeVisualItemsRef.current.push(visualItem);

        nodeContainer.on("pointerover", () => {
          visualItem.hovered = true;
          label.alpha = 1;
          label.style.fill = colorToCss(NODE_COLORS[node.type]);
          shape.alpha = 1;
          syncLabelReadability();
          renderFrame();
        });
        nodeContainer.on("pointerout", () => {
          visualItem.hovered = false;
          label.style.fill = "#e6d9cc";
          syncLabelReadability();
          renderFrame();
        });
        nodeLayer.addChild(nodeContainer);
      });

      const selectionLayer = new Container();
      world.addChild(selectionLayer);
      selectionLayerRef.current = selectionLayer;

      applyCamera();
      homeMap();
    }, [
      edges,
      mode,
      nodes,
      onSelect,
      ready,
      visibleTypes,
    ]);

    useEffect(() => {
      layoutPositionsRef.current = layoutPositions;
      if (!ready) return;
      animateToLayout(false);
    }, [layoutMode, layoutPositions, ready]);

    useEffect(() => {
      if (!ready) return;
      const layer = selectionLayerRef.current;
      if (!layer) return;

      destroyChildren(layer);

      const shownNodes = nodes.filter((node) => visibleTypes.has(node.type));
      const shownIds = new Set(shownNodes.map((node) => node.id));
      const nodeById = new Map(
        shownNodes.map((node) => {
          const position = displayPositionFor(node);
          return [node.id, { ...node, x: position.x, y: position.y }];
        }),
      );
      const routeKeys = new Set(
        routeNodeIds.slice(1).map((id, index) => edgeKey(routeNodeIds[index], id)),
      );
      const emphasizedIds = new Set(routeNodeIds);
      if (selectedId) emphasizedIds.add(selectedId);

      if (!selectedId && routeKeys.size === 0) {
        renderFrame();
        return;
      }

      const edgeLayer = new Graphics();
      edges.forEach((edge) => {
        if (!shownIds.has(edge.source) || !shownIds.has(edge.target)) return;
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return;

        const selected = edge.source === selectedId || edge.target === selectedId;
        const onRoute = routeKeys.has(edgeKey(edge.source, edge.target));
        if (!selected && !onRoute) return;

        trace(
          edgeLayer,
          source,
          target,
          onRoute ? 0xd6b85d : NODE_COLORS[source.type],
          onRoute ? 0.92 : 0.72,
          onRoute ? 4 : 3,
        );
      });
      layer.addChild(edgeLayer);

      emphasizedIds.forEach((nodeId) => {
        const node = nodeById.get(nodeId);
        if (!node) return;

        const position = displayPositionFor(node);
        const nodeContainer = new Container();
        nodeContainer.position.set(position.x, position.y);
        nodeContainer.eventMode = "none";

        const shape = new Graphics();
        drawNodeShape(shape, node, true);
        nodeContainer.addChild(shape);

        const label = new Text({
          text: node.label,
          style: {
            fill: 0xfff3e6,
            fontFamily: "Arial, sans-serif",
            fontSize: 18,
            fontWeight: "700",
            align: "center",
            wordWrap: true,
            wordWrapWidth: 150,
          },
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, nodeRadius(node) + 12);
        nodeContainer.addChild(label);

        layer.addChild(nodeContainer);
      });

      if (selectedId) focusNode(selectedId);
      else renderFrame();
    }, [edges, nodes, ready, routeNodeIds, selectedId, visibleTypes]);

    return <div ref={hostRef} className="graph-map" aria-label="Interactive Music History Map" />;
  },
);
