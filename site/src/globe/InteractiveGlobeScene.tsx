import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import type { Topology } from "topojson-specification";
import type { GlobeEdge, GlobeNode } from "./data";
import { connectionPath, offsetPlace, PLACE_PAGE_SIZE, visiblePlaceIndices } from "./node-layout.mjs";
import { markerPlacements, samePlace } from "./markers.mjs";

export interface Place {
  id: string; name: string; country: string; lat: number; lon: number;
}

export interface Placement {
  nodeId: string; placeId: string; role: "musical_base" | "birthplace"; place: Place;
  evidenceUrl: string; evidence: string;
  note?: string;
  identitySource?: string;
  identityNote?: string;
  coordinateSource?: string;
}

interface Props {
  nodes: GlobeNode[];
  edges: GlobeEdge[];
  placements: Placement[];
  selectedId?: string;
  homeSignal: number;
  zoomCommand?: { id: number; direction: "in" | "out" };
  showAll: boolean;
  onPick: (nodeId: string) => void;
}

interface Marker {
  node: GlobeNode;
  placement: Placement;
  displayPlace: Place;
  element: HTMLButtonElement;
  x: number;
  y: number;
  visible: boolean;
}

interface PlaceGroup {
  place: Place;
  markers: Marker[];
  cluster: HTMLButtonElement;
  label: HTMLDivElement;
  page: number;
}

interface Runtime {
  camera: THREE.PerspectiveCamera;
  groups: PlaceGroup[];
  markers: Map<string, Marker>;
  wires: Map<string, SVGPathElement>;
  flyTo: THREE.Vector3 | null;
  selectedId?: string;
  relatedIds: Set<string>;
  showAll: boolean;
}

const colors: Record<string, number> = {
  band: 0xd47748, artist: 0xd99679, guitarist: 0xd7b765,
};
const MAP_RADIUS = 1.008;
const countryLabels = [
  { id: "us", name: "UNITED STATES", country: "UNITED STATES", lat: 39, lon: -99 },
  { id: "ca", name: "CANADA", country: "CANADA", lat: 57, lon: -106 },
  { id: "uk", name: "UNITED KINGDOM", country: "UNITED KINGDOM", lat: 54, lon: -3 },
  { id: "de", name: "GERMANY", country: "GERMANY", lat: 51, lon: 10 },
  { id: "se", name: "SWEDEN", country: "SWEDEN", lat: 63, lon: 16 },
  { id: "fi", name: "FINLAND", country: "FINLAND", lat: 65, lon: 26 },
  { id: "au", name: "AUSTRALIA", country: "AUSTRALIA", lat: -25, lon: 134 },
  { id: "za", name: "SOUTH AFRICA", country: "SOUTH AFRICA", lat: -29, lon: 24 },
];

function point(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const phi = lat * Math.PI / 180;
  const theta = lon * Math.PI / 180;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(theta),
  );
}

function gridGeometry(step: number): THREE.BufferGeometry {
  const segments: number[] = [];
  const add = (a: THREE.Vector3, b: THREE.Vector3) => {
    segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };
  for (let lat = -90 + step; lat < 90; lat += step) {
    for (let lon = -180; lon < 180; lon += 2.5) add(point(lat, lon, 1.004), point(lat, lon + 2.5, 1.004));
  }
  for (let lon = -180; lon < 180; lon += step) {
    for (let lat = -90; lat < 90; lat += 2.5) add(point(lat, lon, 1.004), point(lat + 2.5, lon, 1.004));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return geometry;
}

function countryGeometry(topology: Topology, viewDirection?: THREE.Vector3, minDot = 0.5, tolerance = 0.025): THREE.BufferGeometry {
  const countries = feature(topology, topology.objects.countries);
  const segments: number[] = [];
  if (countries.type !== "FeatureCollection") return new THREE.BufferGeometry();
  for (const country of countries.features) {
    const shape = country.geometry;
    if (!shape) continue;
    const polygons = shape.type === "Polygon" ? [shape.coordinates]
      : shape.type === "MultiPolygon" ? shape.coordinates : [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        let previous = ring[0];
        for (let i = 1; i < ring.length; i += 1) {
          const current = ring[i];
          if (viewDirection && i < ring.length - 1
            && Math.hypot((current[0] - previous[0]) * Math.cos(current[1] * Math.PI / 180), current[1] - previous[1]) < tolerance) continue;
          if (Math.abs(previous[0] - current[0]) > 180) {
            previous = current;
            continue;
          }
          const a = point(previous[1], previous[0], MAP_RADIUS);
          const b = point(current[1], current[0], MAP_RADIUS);
          if (!viewDirection || a.dot(viewDirection) >= minDot || b.dot(viewDirection) >= minDot) {
            segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
          previous = current;
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return geometry;
}

function screenPoint(place: Place, camera: THREE.PerspectiveCamera, width: number, height: number) {
  const worldPoint = point(place.lat, place.lon, MAP_RADIUS);
  if (worldPoint.dot(camera.position) < MAP_RADIUS * MAP_RADIUS) return null;
  const projected = worldPoint.project(camera);
  const x = (projected.x * 0.5 + 0.5) * width;
  const y = (-projected.y * 0.5 + 0.5) * height;
  return x > -180 && x < width + 180 && y > -180 && y < height + 180 ? { x, y } : null;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function GlobeScene({ nodes, edges, placements, selectedId, homeSignal, zoomCommand, showAll, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e0e);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 100);
    camera.position.copy(point(33, -35, 3.25));
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      host.textContent = "This view needs WebGL. The music map remains available from the back button.";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 1.12;
    controls.maxDistance = 5.4;
    controls.rotateSpeed = 0.585;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshBasicMaterial({ color: 0x101414 }),
    );
    scene.add(sphere);
    const majorGrid = new THREE.LineSegments(gridGeometry(15), new THREE.LineBasicMaterial({
      color: 0x527b7b, transparent: true, opacity: 0.34, depthWrite: false,
    }));
    const minorGrid = new THREE.LineSegments(gridGeometry(5), new THREE.LineBasicMaterial({
      color: 0x4e7775, transparent: true, opacity: 0, depthWrite: false,
    }));
    const borders = new THREE.LineSegments(countryGeometry(world as unknown as Topology), new THREE.LineBasicMaterial({
      color: 0x9d8e79, transparent: true, opacity: 0.69, depthWrite: false,
    }));
    let detailedBorders: THREE.LineSegments | null = null;
    let detailedWorld: Topology | null = null;
    let detailDirection: THREE.Vector3 | null = null;
    let detailLevel = "mid";
    let lastDetailBuild = 0;
    let detailsRequested = false;
    let disposed = false;
    scene.add(majorGrid, minorGrid, borders);
    const wireLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    wireLayer.classList.add("globe-wire-layer");
    wireLayer.setAttribute("aria-hidden", "true");
    const markerLayer = document.createElement("div");
    markerLayer.className = "globe-marker-layer";
    const labelLayer = document.createElement("div");
    labelLayer.className = "globe-place-labels";
    labelLayer.setAttribute("aria-hidden", "true");
    host.append(wireLayer, markerLayer, labelLayer);
    const runtime: Runtime = {
      camera, groups: [], markers: new Map(), wires: new Map(), flyTo: null,
      relatedIds: new Set(), showAll: false,
    };
    runtimeRef.current = runtime;

    let firstResize = true;
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      wireLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
      if (firstResize) {
        camera.position.copy(point(33, -35, width < 600 ? 4.8 : 3.25));
        firstResize = false;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const countryElements = countryLabels.map((place) => {
      const label = document.createElement("div");
      label.className = "globe-place-label globe-country-label";
      label.textContent = place.name;
      labelLayer.appendChild(label);
      return { place, label };
    });
    let animation = 0;
    let lastFrame = performance.now();
    const frame = () => {
      animation = requestAnimationFrame(frame);
      const now = performance.now();
      const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      if (runtime.flyTo) {
        camera.position.lerp(runtime.flyTo, 1 - Math.exp(-4 * elapsed));
        if (camera.position.distanceTo(runtime.flyTo) < 0.005) runtime.flyTo = null;
      }
      const zoomPercent = 100 * (controls.maxDistance - camera.position.length())
        / (controls.maxDistance - controls.minDistance);
      const closeZoom = Math.max(0, Math.min(1, (zoomPercent - 50) / 50));
      const easing = closeZoom * closeZoom * (3 - 2 * closeZoom);
      controls.rotateSpeed = 0.585 * (1 - 0.65 * easing);
      controls.update();
      const distance = camera.position.length();
      const requestedLevel = distance < 1.32 ? "close" : "mid";
      const detailCutoff = requestedLevel === "close" ? 0.75 : 0.5;
      const detailTolerance = requestedLevel === "close" ? 0.012 : 0.025;
      if (distance < 2.1 && !detailsRequested) {
        detailsRequested = true;
        void import("world-atlas/countries-10m.json").then(({ default: detailData }) => {
          if (disposed) return;
          const direction = camera.position.clone().normalize();
          const topology = detailData as unknown as Topology;
          detailedBorders = new THREE.LineSegments(
            countryGeometry(topology, direction, detailCutoff, detailTolerance),
            new THREE.LineBasicMaterial({ color: 0x9d8e79, transparent: true, opacity: 0, depthWrite: false }),
          );
          detailDirection = direction;
          detailLevel = requestedLevel;
          lastDetailBuild = performance.now();
          detailedWorld = topology;
          scene.add(detailedBorders);
        }).catch(() => { /* The base coastline remains available. */ });
      }
      if (distance < 2.1 && detailedBorders && detailedWorld && detailDirection && now - lastDetailBuild > 300) {
        const direction = camera.position.clone().normalize();
        if (direction.dot(detailDirection) < 0.975 || requestedLevel !== detailLevel) {
          const previous = detailedBorders.geometry;
          detailedBorders.geometry = countryGeometry(detailedWorld, direction, detailCutoff, detailTolerance);
          previous.dispose();
          detailDirection = direction;
          detailLevel = requestedLevel;
          lastDetailBuild = now;
        }
      }
      const detailMix = detailedBorders ? Math.max(0, Math.min(1, (2.1 - distance) / 0.5)) : 0;
      (borders.material as THREE.LineBasicMaterial).opacity = 0.69 * (1 - 0.45 * detailMix);
      if (detailedBorders) (detailedBorders.material as THREE.LineBasicMaterial).opacity = 0.55 * detailMix;
      (minorGrid.material as THREE.LineBasicMaterial).opacity = Math.max(0, Math.min(0.26, (2.35 - distance) * 0.35));
      const width = host.clientWidth;
      const height = host.clientHeight;
      const globeRadius = height / (2 * Math.tan(camera.fov * Math.PI / 360) * Math.sqrt(distance * distance - 1));
      const insideStage = (anchor: { x: number; y: number } | null) => Boolean(anchor
        && anchor.x > 12 && anchor.x < width - 12 && anchor.y > 115
        && anchor.y < height - (width < 600 ? 105 : 135));
      const labelBoxes: Array<{ x: number; y: number; width: number; height: number }> = [];
      const ordered = [...runtime.groups].sort((a, b) =>
        Number(b.markers.some((marker) => marker.node.id === runtime.selectedId))
        - Number(a.markers.some((marker) => marker.node.id === runtime.selectedId))
        || Number(b.markers.some((marker) => runtime.relatedIds.has(marker.node.id)))
          - Number(a.markers.some((marker) => runtime.relatedIds.has(marker.node.id)))
        || b.markers.length - a.markers.length);
      const anchors = new Map<PlaceGroup, { x: number; y: number } | null>();
      const collapsed = new Map<string, Array<{ group: PlaceGroup; x: number; y: number }>>();
      const visibleByGroup = new Map<PlaceGroup, number[]>();
      const expandedByGroup = new Map<PlaceGroup, boolean>();
      for (const group of ordered) {
        const anchor = screenPoint(group.place, camera, width, height);
        anchors.set(group, anchor);
        const visible = insideStage(anchor);
        const featured = group.markers.filter((marker) => marker.node.id === runtime.selectedId
          || runtime.relatedIds.has(marker.node.id));
        const expanded = runtime.showAll || distance < 1.3
          || (group.markers.length === 1 && (distance < 2 || featured.length > 0));
        expandedByGroup.set(group, expanded);
        group.cluster.hidden = true;
        group.cluster.classList.toggle("is-muted", Boolean(runtime.selectedId) && featured.length === 0);
        if (visible && !expanded && featured.length === 0 && anchor) {
          const key = `${Math.floor(anchor.x / 58)}:${Math.floor(anchor.y / 58)}`;
          const bucket = collapsed.get(key) ?? [];
          bucket.push({ group, x: anchor.x, y: anchor.y });
          collapsed.set(key, bucket);
        }
        const pinned = group.markers[0]?.node.id === runtime.selectedId;
        const indices = visiblePlaceIndices(group.markers.length, group.page, runtime.showAll, pinned);
        visibleByGroup.set(group, indices);
        if (visible && !runtime.showAll && anchor && group.markers.length > featured.length
          && ((expanded && group.markers.length > PLACE_PAGE_SIZE) || (!expanded && featured.length > 0))) {
          const remaining = group.markers.length - (expanded ? indices.length : featured.length);
          group.cluster.hidden = false;
          group.cluster.textContent = `+${remaining}`;
          group.cluster.title = expanded ? `Show more from ${group.place.name}` : `Zoom to ${group.place.name}`;
          group.cluster.setAttribute("aria-label", group.cluster.title);
          group.cluster.style.transform = `translate(${anchor.x - 12}px, ${anchor.y + 34}px)`;
        }
        const showPlace = visible && distance < 2.48 && anchor
          && anchor.x > 10 && anchor.x < width - 110 && anchor.y > 110 && anchor.y < height - 110;
        group.label.hidden = !showPlace;
        if (showPlace && anchor) {
          const box = { x: anchor.x + (group.markers.length > 1 ? 15 : 10),
            y: anchor.y + (group.markers.length > 1 ? 10 : 16),
            width: Math.max(60, group.place.name.length * 7.4), height: 18 };
          if (labelBoxes.some((other) => overlaps(box, other))) group.label.hidden = true;
          else {
            labelBoxes.push(box);
            group.label.style.transform = `translate(${box.x}px, ${box.y}px)`;
          }
        }
      }
      for (const bucket of collapsed.values()) {
        const representative = bucket[0].group.cluster;
        const count = bucket.reduce((sum, item) => sum + item.group.markers.length, 0);
        const x = bucket.reduce((sum, item) => sum + item.x, 0) / bucket.length;
        const y = bucket.reduce((sum, item) => sum + item.y, 0) / bucket.length;
        representative.hidden = false;
        representative.textContent = count > 1 ? String(count) : "";
        representative.title = `${count} mapped ${count === 1 ? "node" : "nodes"}`;
        representative.setAttribute("aria-label", `Zoom to ${count} mapped ${count === 1 ? "node" : "nodes"}`);
        representative.style.transform = `translate(${x - 12}px, ${y - 12}px)`;
      }
      for (const { place, label } of countryElements) {
        const anchor = screenPoint(place, camera, width, height);
        label.hidden = !anchor || distance > 3.7 || anchor.x < 20 || anchor.x > width - 130
          || anchor.y < 130 || anchor.y > height - 120;
        if (!label.hidden && anchor) label.style.transform = `translate(${anchor.x}px, ${anchor.y}px)`;
      }
      const dotBoxes: Array<{ x: number; y: number; width: number; height: number }> = [];
      for (const group of ordered) {
        const anchor = anchors.get(group);
        const visibleIndices = visibleByGroup.get(group) ?? [];
        const expanded = expandedByGroup.get(group);
        for (let index = 0; index < group.markers.length; index += 1) {
          const marker = group.markers[index];
          const slot = visibleIndices.indexOf(index);
          const featured = marker.node.id === runtime.selectedId || runtime.relatedIds.has(marker.node.id);
          const projected = insideStage(anchor ?? null) && (expanded ? slot >= 0 : featured)
            ? screenPoint(marker.displayPlace, camera, width, height) : null;
          marker.x = projected?.x ?? 0;
          marker.y = projected?.y ?? 0;
          marker.visible = Boolean(projected)
            && Math.hypot(marker.x - width / 2, marker.y - height / 2) < globeRadius - 8
            && marker.x > 8 && marker.x < width - 8 && marker.y > 100 && marker.y < height - 90;
          marker.element.hidden = !marker.visible;
          if (!marker.visible) continue;
          dotBoxes.push({ x: marker.x - 9, y: marker.y - 9, width: 19, height: 19 });
          marker.element.style.transform = `translate(${marker.x - 7}px, ${marker.y - 7}px)`;
        }
      }
      const selected = runtime.selectedId ? runtime.markers.get(runtime.selectedId) : undefined;
      for (const [id, path] of runtime.wires) {
        const target = runtime.markers.get(id);
        const visible = selected?.visible && target?.visible
          && selected.x > 0 && selected.x < width && selected.y > 0 && selected.y < height
          && target.x > 0 && target.x < width && target.y > 0 && target.y < height;
        path.style.display = visible ? "" : "none";
        if (visible && selected && target) path.setAttribute("d", connectionPath(selected, target));
      }
      const prioritized = [...runtime.markers.values()].filter((marker) => marker.visible)
        .sort((a, b) => Number(b.node.id === runtime.selectedId) - Number(a.node.id === runtime.selectedId)
          || Number(runtime.relatedIds.has(b.node.id)) - Number(runtime.relatedIds.has(a.node.id)));
      for (const marker of prioritized) {
        const important = marker.node.id === runtime.selectedId || runtime.relatedIds.has(marker.node.id);
        const candidate = distance < 1.75 || important;
        const labelWidth = Math.min(125, marker.node.label.length * 6.3 + 5);
        const options = [
          { x: marker.x + 16, y: marker.y - 8 },
          { x: marker.x - labelWidth - 16, y: marker.y - 8 },
          { x: marker.x - labelWidth / 2, y: marker.y - 30 },
          { x: marker.x - labelWidth / 2, y: marker.y + 16 },
        ];
        const chosen = candidate ? (important ? options : options.slice(0, 1)).find(({ x, y }) => {
          const box = { x, y, width: labelWidth, height: 17 };
          return x > 5 && x + labelWidth < width - 5 && y > 92 && y + 17 < height - 90
            && !labelBoxes.some((other) => overlaps(box, other))
            && (important || !dotBoxes.some((other) => overlaps(box, other)
              && Math.hypot(other.x + 9 - marker.x, other.y + 9 - marker.y) > 10));
        }) ?? (marker.node.id === runtime.selectedId ? options.find(({ x, y }) =>
          x > 5 && x + labelWidth < width - 5 && y > 92 && y + 17 < height - 90) : undefined) : undefined;
        marker.element.classList.toggle("has-name", Boolean(chosen));
        if (chosen) {
          marker.element.firstElementChild!.setAttribute("style",
            `left:${chosen.x - marker.x + 7}px;top:${chosen.y - marker.y + 7}px`);
          labelBoxes.push({ ...chosen, width: labelWidth, height: 17 });
        }
      }
      renderer.render(scene, camera);
    };
    frame();
    controls.addEventListener("start", () => { runtime.flyTo = null; });
    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      for (const item of [sphere, majorGrid, minorGrid, borders]) {
        item.geometry.dispose();
        (item.material as THREE.Material).dispose();
      }
      if (detailedBorders) {
        detailedBorders.geometry.dispose();
        (detailedBorders.material as THREE.Material).dispose();
      }
      renderer.dispose();
      host.replaceChildren();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const host = containerRef.current;
    if (!runtime || !host) return;
    const markerLayer = host.querySelector(".globe-marker-layer")!;
    const labelLayer = host.querySelector(".globe-place-labels")!;
    const wireLayer = host.querySelector(".globe-wire-layer")!;
    markerLayer.replaceChildren();
    labelLayer.querySelectorAll(":not(.globe-country-label)").forEach((element) => element.remove());
    wireLayer.replaceChildren();
    runtime.markers.clear();
    runtime.wires.clear();
    runtime.selectedId = selectedId;
    runtime.showAll = showAll;
    runtime.relatedIds = new Set(edges.filter((edge) => edge.source === selectedId || edge.target === selectedId)
      .map((edge) => edge.source === selectedId ? edge.target : edge.source));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const grouped = new Map<string, PlaceGroup>();
    const groups: PlaceGroup[] = [];
    for (const placement of markerPlacements(placements, selectedId)) {
      const node = byId.get(placement.nodeId);
      if (!node || (runtime.markers.has(node.id) && placement.role === "musical_base")) continue;
      let group = grouped.get(placement.placeId) ?? groups.find((candidate) => samePlace(candidate.place, placement.place));
      if (!group) {
        const cluster = document.createElement("button");
        cluster.type = "button";
        cluster.className = "globe-cluster";
        cluster.title = placement.place.name;
        cluster.setAttribute("aria-label", `Zoom to ${placement.place.name}`);
        cluster.addEventListener("click", () => {
          if (runtime.camera.position.length() < 1.3 && group && group.markers.length > PLACE_PAGE_SIZE && !runtime.showAll) {
            const pinned = group.markers[0]?.node.id === runtime.selectedId;
            group.page = (group.page + 1) % Math.ceil((group.markers.length - Number(pinned)) / (PLACE_PAGE_SIZE - Number(pinned)));
          } else runtime.flyTo = point(placement.place.lat, placement.place.lon, 1.2);
        });
        markerLayer.appendChild(cluster);
        const label = document.createElement("div");
        label.className = "globe-place-label";
        label.textContent = placement.place.name;
        labelLayer.appendChild(label);
        group = { place: placement.place, markers: [], cluster, label, page: 0 };
        groups.push(group);
      }
      grouped.set(placement.placeId, group);
      const element = document.createElement("button");
      element.type = "button";
      element.className = "globe-node";
      element.title = `${node.label} · ${placement.role === "birthplace" ? "birthplace" : placement.place.name}`;
      element.setAttribute("aria-label", `${node.label}, ${placement.place.name}`);
      element.style.setProperty("--node-color", `#${(placement.role === "birthplace" ? 0x83cbd5 : colors[node.type] ?? 0xd47748).toString(16).padStart(6, "0")}`);
      const name = document.createElement("span");
      name.className = "globe-node-name";
      name.textContent = placement.role === "birthplace" ? `${node.label} · birthplace` : node.label;
      element.appendChild(name);
      element.addEventListener("click", () => onPickRef.current(node.id));
      if (selectedId) element.classList.toggle("is-muted", node.id !== selectedId && !runtime.relatedIds.has(node.id));
      element.classList.toggle("is-related", runtime.relatedIds.has(node.id));
      element.classList.toggle("is-selected", node.id === selectedId);
      element.classList.toggle("is-birthplace", placement.role === "birthplace");
      markerLayer.appendChild(element);
      const marker = { node, placement, displayPlace: placement.place, element, x: 0, y: 0, visible: false };
      group.markers.push(marker);
      if (placement.role === "musical_base" || !runtime.markers.has(node.id)) runtime.markers.set(node.id, marker);
    }
    runtime.groups = groups;
    for (const group of runtime.groups) {
      [...group.markers].sort((a, b) => a.node.id.localeCompare(b.node.id)).forEach((marker, index) => {
        marker.displayPlace = offsetPlace(group.place, index);
      });
      group.markers.sort((a, b) => Number(b.node.id === selectedId) - Number(a.node.id === selectedId)
        || Number(runtime.relatedIds.has(b.node.id)) - Number(runtime.relatedIds.has(a.node.id))
        || a.node.label.localeCompare(b.node.label));
      group.cluster.textContent = String(group.markers.length);
    }
    if (selectedId) {
      for (const id of runtime.relatedIds) {
        if (!runtime.markers.has(id)) continue;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.classList.add("globe-wire");
        wireLayer.appendChild(path);
        runtime.wires.set(id, path);
      }
    }
  }, [nodes, edges, placements, selectedId, showAll]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !selectedId) return;
    const place = placements.find((entry) => entry.nodeId === selectedId && entry.role === "musical_base")?.place
      ?? placements.find((entry) => entry.nodeId === selectedId && entry.role === "birthplace")?.place;
    if (place) runtime.flyTo = point(place.lat, place.lon, containerRef.current!.clientWidth < 600 ? 1.75 : 1.48);
  }, [selectedId, placements]);

  useEffect(() => {
    if (homeSignal > 0 && runtimeRef.current) {
      const width = containerRef.current?.clientWidth ?? 1000;
      runtimeRef.current.flyTo = point(33, -35, width < 600 ? 4.8 : 3.25);
    }
  }, [homeSignal]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !zoomCommand) return;
    const current = runtime.flyTo ?? runtime.camera.position;
    const distance = Math.max(1.12, Math.min(5.4,
      current.length() * (zoomCommand.direction === "in" ? 0.8 : 1.25)));
    runtime.flyTo = current.clone().setLength(distance);
  }, [zoomCommand]);

  return <div className="globe-scene" ref={containerRef} aria-label="Interactive music history globe" />;
}
