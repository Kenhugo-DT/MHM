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
  onSelect(node: GraphNode): void;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
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

function drawNodeShape(graphics: Graphics, node: GraphNode, emphasized: boolean) {
  const color = NODE_COLORS[node.type];
  const radius = nodeRadius(node);

  if (node.type === "genre") {
    graphics.roundRect(-radius * 2.7, -radius, radius * 5.4, radius * 2, 18);
    graphics.fill({ color: 0x11110f, alpha: 0.94 });
    graphics.stroke({ color, alpha: emphasized ? 1 : 0.72, width: emphasized ? 3 : 2 });
    return;
  }

  if (node.type === "band") {
    graphics.roundRect(-radius * 1.6, -radius, radius * 3.2, radius * 2, 8);
    graphics.fill({ color: 0x11110f, alpha: 0.96 });
    graphics.stroke({ color, alpha: emphasized ? 1 : 0.8, width: emphasized ? 3 : 2 });
    return;
  }

  if (node.type === "guitar_brand") {
    graphics.rect(-radius * 1.65, -radius, radius * 3.3, radius * 2);
    graphics.fill({ color: 0x11110f, alpha: 0.96 });
    graphics.stroke({ color, alpha: 0.88, width: emphasized ? 3 : 2 });
    graphics.rect(-radius * 1.35, -radius * 0.7, radius * 2.7, radius * 1.4);
    graphics.stroke({ color, alpha: 0.45, width: 1 });
    return;
  }

  if (node.type === "guitar") {
    graphics.rect(-radius * 1.4, -radius * 0.75, radius * 2.8, radius * 1.5);
    graphics.fill({ color: 0x11110f, alpha: 0.96 });
    graphics.stroke({ color, alpha: 0.88, width: emphasized ? 3 : 2 });
    graphics.moveTo(radius * 1.4, 0);
    graphics.lineTo(radius * 2.15, 0);
    graphics.stroke({ color, alpha: 0.78, width: 2 });
    return;
  }

  graphics.circle(0, 0, radius);
  graphics.fill({ color, alpha: emphasized ? 1 : 0.88 });
  graphics.circle(0, 0, radius + 4);
  graphics.stroke({ color, alpha: emphasized ? 0.86 : 0.32, width: emphasized ? 3 : 2 });
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
    const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 0.42 });
    const nodesRef = useRef(nodes);
    const onSelectRef = useRef(onSelect);
    const visibleTypesRef = useRef(visibleTypes);
    const labelItemsRef = useRef<
      Array<{
        label: Text;
        node: GraphNode;
        alwaysLabel: boolean;
        hovered: boolean;
      }>
    >([]);
    const [ready, setReady] = useState(false);

    nodesRef.current = nodes;
    onSelectRef.current = onSelect;
    visibleTypesRef.current = visibleTypes;

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

    function syncLabelReadability(camera = cameraRef.current) {
      const compact = isCompactMap();
      const targetScreenScale = compact ? 0.86 : 1;
      const labelScale = compact
        ? Math.min(2.45, Math.max(1, targetScreenScale / camera.zoom))
        : 1;

      labelItemsRef.current.forEach((item) => {
        item.label.scale.set(labelScale);
        item.label.position.y = Math.max(nodeRadius(item.node) + 12, 18 / camera.zoom);

        if (item.hovered) {
          item.label.alpha = 1;
          return;
        }

        item.label.alpha = item.alwaysLabel ? 0.95 : 0;
      });
    }

    function applyCamera(camera = cameraRef.current) {
      const app = appRef.current;
      const viewport = viewportRef.current;
      if (!app || !viewport) return;
      syncLabelReadability(camera);
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
      syncLabelReadability();
    }

    function pickNodeAtWorld(x: number, y: number) {
      let closest: { node: GraphNode; distance: number } | undefined;

      nodesRef.current.forEach((node) => {
        if (!visibleTypesRef.current.has(node.type)) return;

        const dx = x - node.x;
        const dy = y - node.y;
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
        ...list.map((node) => node.x),
        ...zones.map((zone) => zone.x),
      );
      const maxX = Math.max(
        ...list.map((node) => node.x),
        ...zones.map((zone) => zone.x + zone.width),
      );
      const minY = Math.min(
        ...list.map((node) => node.y),
        ...zones.map((zone) => zone.y),
      );
      const maxY = Math.max(
        ...list.map((node) => node.y),
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
      cameraRef.current = {
        x: node.x + (window.innerWidth > 980 ? 190 : 0),
        y: node.y,
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
          antialias: false,
          autoDensity: true,
          resolution: 1,
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
      labelItemsRef.current = [];

      const shownNodes = nodes.filter((node) => visibleTypes.has(node.type));
      const shownIds = new Set(shownNodes.map((node) => node.id));
      const nodeById = new Map(shownNodes.map((node) => [node.id, node]));

      const grid = new Graphics();
      const graphMinX = Math.min(...shownNodes.map((node) => node.x), -1800) - 900;
      const graphMaxX = Math.max(...shownNodes.map((node) => node.x), 3800) + 900;
      const graphMinY = Math.min(...shownNodes.map((node) => node.y), -1400) - 900;
      const graphMaxY = Math.max(...shownNodes.map((node) => node.y), 1700) + 900;
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

      MAP_ZONES.filter((zone) => zone.mode === mode).forEach((zone) => {
        const zoneGraphic = new Graphics();
        zoneGraphic.rect(zone.x, zone.y, zone.width, zone.height);
        zoneGraphic.fill({ color: 0x0d0d0b, alpha: 0.16 });
        zoneGraphic.stroke({ color: zone.color, alpha: 0.22, width: 2 });
        world.addChild(zoneGraphic);

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
        zoneLabel.position.set(zone.x + 22, zone.y + 18);
        world.addChild(zoneLabel);
      });

      const edgeLayer = new Graphics();
      edges.forEach((edge) => {
        if (!shownIds.has(edge.source) || !shownIds.has(edge.target)) return;
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return;

        const primary = edge.strength >= 0.64;
        if (!primary) return;

        trace(
          edgeLayer,
          source,
          target,
          0xcabbb1,
          0.18,
          1.5,
        );
      });
      world.addChild(edgeLayer);

      shownNodes.forEach((node) => {
        const nodeContainer = new Container();
        nodeContainer.position.set(node.x, node.y);
        nodeContainer.eventMode = "static";
        nodeContainer.cursor = "pointer";
        nodeContainer.hitArea = new Rectangle(-38, -28, 76, 70);

        const shape = new Graphics();
        drawNodeShape(shape, node, false);
        nodeContainer.addChild(shape);

        const alwaysLabel = Boolean(
          node.type === "genre" ||
            node.type === "band" ||
            node.type === "guitar_brand" ||
            node.starter,
        );
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
        label.position.set(0, nodeRadius(node) + 12);
        label.alpha = alwaysLabel ? 0.95 : 0;
        nodeContainer.addChild(label);
        const labelItem = {
          label,
          node,
          alwaysLabel,
          hovered: false,
        };
        labelItemsRef.current.push(labelItem);

        nodeContainer.on("pointerover", () => {
          labelItem.hovered = true;
          label.alpha = 1;
          label.style.fill = colorToCss(NODE_COLORS[node.type]);
          shape.alpha = 1;
          syncLabelReadability();
          renderFrame();
        });
        nodeContainer.on("pointerout", () => {
          labelItem.hovered = false;
          label.style.fill = "#e6d9cc";
          syncLabelReadability();
          renderFrame();
        });
        world.addChild(nodeContainer);
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
      if (!ready) return;
      const layer = selectionLayerRef.current;
      if (!layer) return;

      destroyChildren(layer);

      const shownNodes = nodes.filter((node) => visibleTypes.has(node.type));
      const shownIds = new Set(shownNodes.map((node) => node.id));
      const nodeById = new Map(shownNodes.map((node) => [node.id, node]));
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

        const nodeContainer = new Container();
        nodeContainer.position.set(node.x, node.y);
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
