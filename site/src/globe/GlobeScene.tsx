import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import type { Topology } from "topojson-specification";
import type { GlobeEdge, GlobeNode } from "./data";

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

interface Marker {
  key: string;
  place: Place;
  nodeIds: string[];
  role: string;
}

interface Props {
  nodes: GlobeNode[];
  edges: GlobeEdge[];
  placements: Placement[];
  selectedId?: string;
  homeSignal: number;
  year: number;
  showAll: boolean;
  onPick: (marker: { nodeIds: string[]; place: Place; role: string }) => void;
}

const colors: Record<string, number> = {
  band: 0xd47748,
  artist: 0xd99679,
  guitarist: 0xd7b765,
  genre: 0x61b9af,
  guitar: 0x86b3d3,
  guitar_brand: 0x9fae6e,
};

const countryLabels = [
  { id: "us", name: "UNITED STATES", lat: 39, lon: -99 },
  { id: "ca", name: "CANADA", lat: 57, lon: -106 },
  { id: "uk", name: "UNITED KINGDOM", lat: 54, lon: -3 },
  { id: "de", name: "GERMANY", lat: 51, lon: 10 },
  { id: "se", name: "SWEDEN", lat: 63, lon: 16 },
  { id: "fi", name: "FINLAND", lat: 65, lon: 26 },
  { id: "au", name: "AUSTRALIA", lat: -25, lon: 134 },
  { id: "za", name: "SOUTH AFRICA", lat: -29, lon: 24 },
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

function markerList(placements: Placement[], showAll: boolean): Marker[] {
  if (showAll) {
    return placements.map((entry, index) => ({
      key: `${entry.nodeId}-${entry.role}-${index}`,
      place: entry.place,
      nodeIds: [entry.nodeId],
      role: entry.role,
    }));
  }
  const grouped = new Map<string, Marker>();
  for (const entry of placements) {
    const key = `${entry.placeId}:${entry.role}`;
    const marker = grouped.get(key);
    if (marker) marker.nodeIds.push(entry.nodeId);
    else grouped.set(key, { key, place: entry.place, nodeIds: [entry.nodeId], role: entry.role });
  }
  return [...grouped.values()];
}

function countryGeometry(): THREE.BufferGeometry {
  const topology = world as unknown as Topology;
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
        for (let i = 1; i < ring.length; i += 1) {
          const previous = ring[i - 1];
          const current = ring[i];
          if (Math.abs(previous[0] - current[0]) > 180) continue;
          const a = point(previous[1], previous[0], 1.006);
          const b = point(current[1], current[0], 1.006);
          segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return geometry;
}

function gridGeometry(): THREE.BufferGeometry {
  const segments: number[] = [];
  const add = (a: THREE.Vector3, b: THREE.Vector3) => {
    segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon < 180; lon += 3) add(point(lat, lon, 1.004), point(lat, lon + 3, 1.004));
  }
  for (let lon = -180; lon < 180; lon += 15) {
    for (let lat = -90; lat < 90; lat += 3) add(point(lat, lon, 1.004), point(lat + 3, lon, 1.004));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return geometry;
}

function arcBetween(a: Place, b: Place): THREE.Line {
  const start = point(a.lat, a.lon, 1.02);
  const end = point(b.lat, b.lon, 1.02);
  const angle = start.angleTo(end);
  const points: THREE.Vector3[] = [];
  for (let step = 0; step <= 36; step += 1) {
    const t = step / 36;
    const interpolated = start.clone().lerp(end, t).normalize();
    const height = 1.025 + Math.sin(Math.PI * t) * Math.min(0.24, angle * 0.12);
    points.push(interpolated.multiplyScalar(height));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xe6b872, transparent: true, opacity: 0.67, depthWrite: false }),
  );
}

export function GlobeScene({ nodes, edges, placements, selectedId, homeSignal, year, showAll, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{
    camera: THREE.PerspectiveCamera;
    scene: THREE.Scene;
    sphere: THREE.Mesh;
    controls: OrbitControls;
    markerGroup: THREE.Group;
    arcGroup: THREE.Group;
    labelLayer: HTMLDivElement;
    flyTo: THREE.Vector3 | null;
  } | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d0b);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.copy(point(33, -35, 3.25));
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
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
    controls.minDistance = 1.35;
    controls.maxDistance = 5.4;
    controls.rotateSpeed = 0.65;

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x181714 }),
    );
    scene.add(sphere);
    const grid = new THREE.LineSegments(gridGeometry(), new THREE.LineBasicMaterial({
      color: 0x665b4c, transparent: true, opacity: 0.27, depthWrite: false,
    }));
    scene.add(grid);
    const borders = new THREE.LineSegments(countryGeometry(), new THREE.LineBasicMaterial({
      color: 0xa88468, transparent: true, opacity: 0.52, depthWrite: false,
    }));
    scene.add(borders);
    const markerGroup = new THREE.Group();
    const arcGroup = new THREE.Group();
    scene.add(markerGroup, arcGroup);
    const labelLayer = document.createElement("div");
    labelLayer.className = "globe-place-labels";
    labelLayer.setAttribute("aria-hidden", "true");
    host.appendChild(labelLayer);
    const runtime = { camera, scene, sphere, controls, markerGroup, arcGroup, labelLayer, flyTo: null as THREE.Vector3 | null };
    runtimeRef.current = runtime;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let markers: Marker[] = [];
    let mesh: THREE.InstancedMesh | undefined;
    let moved = false;
    let pressed = false;
    const tooltip = document.createElement("div");
    tooltip.className = "globe-tooltip";
    tooltip.hidden = true;
    host.appendChild(tooltip);
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    };
    const picked = () => {
      if (!mesh) return undefined;
      raycaster.setFromCamera(pointer, camera);
      const sphereHit = raycaster.intersectObject(sphere, false)[0];
      return raycaster.intersectObject(mesh, false).find((hit) =>
        hit.instanceId !== undefined && (!sphereHit || hit.distance <= sphereHit.distance + 0.03));
    };
    const onDown = () => { pressed = true; moved = false; runtime.flyTo = null; };
    const onMove = (event: PointerEvent) => {
      if (pressed) { moved = true; tooltip.hidden = true; return; }
      setPointer(event);
      const hit = picked();
      const marker = hit?.instanceId === undefined ? undefined : markers[hit.instanceId];
      renderer.domElement.style.cursor = marker ? "pointer" : "grab";
      tooltip.hidden = !marker;
      if (marker) {
        tooltip.textContent = marker.nodeIds.length > 1
          ? `${marker.place.name} · ${marker.nodeIds.length} nodes`
          : `${marker.place.name} · ${marker.role === "birthplace" ? "Birthplace" : "Music"}`;
        const bounds = host.getBoundingClientRect();
        tooltip.style.left = `${Math.min(event.clientX - bounds.left + 14, bounds.width - 180)}px`;
        tooltip.style.top = `${Math.max(10, event.clientY - bounds.top - 30)}px`;
      }
    };
    const onUp = (event: PointerEvent) => {
      pressed = false;
      if (moved) return;
      setPointer(event);
      const hit = picked();
      const marker = hit?.instanceId === undefined ? undefined : markers[hit.instanceId];
      if (marker) onPickRef.current(marker);
    };
    const onLeave = () => { pressed = false; tooltip.hidden = true; };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    controls.addEventListener("start", () => { runtime.flyTo = null; });

    let firstResize = true;
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      if (firstResize) {
        camera.position.copy(point(33, -35, width < 600 ? 4.8 : 3.25));
        firstResize = false;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let animation = 0;
    const frame = () => {
      animation = requestAnimationFrame(frame);
      if (runtime.flyTo) {
        camera.position.lerp(runtime.flyTo, 0.06);
        if (camera.position.distanceTo(runtime.flyTo) < 0.008) runtime.flyTo = null;
      }
      controls.update();
      const occupied: Array<{ x: number; y: number; width: number }> = [];
      const labels = (Array.from(labelLayer.children) as HTMLDivElement[])
        .sort((a, b) => Number(b.dataset.priority ?? 0) - Number(a.dataset.priority ?? 0));
      for (const label of labels) {
        const place = (label as HTMLDivElement & { place?: Place }).place;
        if (!place) continue;
        const worldPoint = point(place.lat, place.lon, 1.035);
        const front = worldPoint.dot(camera.position.clone().normalize()) > 0.3;
        const country = label.classList.contains("globe-country-label");
        let visible = front && camera.position.length() < (country ? 4.5 : 2.6);
        if (visible) {
          const projected = worldPoint.project(camera);
          const x = (projected.x * 0.5 + 0.5) * host.clientWidth + 9;
          const y = (-projected.y * 0.5 + 0.5) * host.clientHeight - 4;
          const width = Math.max(38, label.textContent!.length * 6);
          visible = x > 2 && x + width < host.clientWidth - 2 && y > (country ? 135 : 10) && y < host.clientHeight - (country ? 115 : 12)
            && !occupied.some((item) => Math.abs(item.y - y) < 17 && x < item.x + item.width + 14 && x + width + 14 > item.x);
          if (visible) {
            occupied.push({ x, y, width });
            label.style.transform = `translate(${x}px, ${y}px)`;
          }
        }
        label.hidden = !visible;
      }
      renderer.render(scene, camera);
    };
    frame();

    // Marker rebuilding is triggered by the separate effect below.
    Object.assign(runtime, {
      setMarkers(next: Marker[], nextMesh: THREE.InstancedMesh) { markers = next; mesh = nextMesh; },
    });
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      grid.geometry.dispose();
      borders.geometry.dispose();
      sphere.geometry.dispose();
      (sphere.material as THREE.Material).dispose();
      (grid.material as THREE.Material).dispose();
      (borders.material as THREE.Material).dispose();
      renderer.dispose();
      host.replaceChildren();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    for (const object of [...runtime.markerGroup.children, ...runtime.arcGroup.children]) {
      object.traverse((child) => {
        const drawable = child as THREE.Mesh | THREE.Line;
        drawable.geometry?.dispose();
        const material = drawable.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
    }
    runtime.markerGroup.clear();
    runtime.arcGroup.clear();
    runtime.labelLayer.replaceChildren();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const markers = markerList(placements, showAll);
    const geometry = new THREE.SphereGeometry(0.008, 8, 6);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, markers.length));
    const dummy = new THREE.Object3D();
    markers.forEach((marker, index) => {
      const node = byId.get(marker.nodeIds[0]);
      const spread = showAll ? (index % 7 - 3) * 0.33 : 0;
      const position = point(marker.place.lat + spread, marker.place.lon + spread, 1.029);
      dummy.position.copy(position);
      const selected = selectedId && marker.nodeIds.includes(selectedId);
      const scale = selected ? 1.55 : marker.nodeIds.length > 1 ? 1.2 + Math.min(0.75, Math.log2(marker.nodeIds.length) * 0.22) : 1;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const color = new THREE.Color(marker.role === "birthplace" ? 0x83cbd5 : colors[node?.type ?? ""] ?? 0xd47748);
      if (!showAll && node?.eraStart && node.eraStart !== year && !selected) color.multiplyScalar(0.54);
      mesh.setColorAt(index, color);
    });
    mesh.count = markers.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    runtime.markerGroup.add(mesh);
    const setMarkers = runtime as typeof runtime & { setMarkers: (next: Marker[], nextMesh: THREE.InstancedMesh) => void };
    setMarkers.setMarkers(markers, mesh);

    const placeCounts = new Map<string, { place: Place; count: number }>();
    for (const marker of markers) {
      const previous = placeCounts.get(marker.place.id);
      placeCounts.set(marker.place.id, { place: marker.place, count: (previous?.count ?? 0) + marker.nodeIds.length });
    }
    const selectedPlaceId = placements.find((entry) => entry.nodeId === selectedId)?.placeId;
    const labeledPlaces = [...placeCounts.values()].sort((a, b) =>
      Number(b.place.id === selectedPlaceId) - Number(a.place.id === selectedPlaceId) || b.count - a.count);
    for (const { place } of labeledPlaces.slice(0, 55)) {
      const label = document.createElement("div") as HTMLDivElement & { place?: Place };
      label.className = "globe-place-label";
      label.textContent = place.name;
      label.place = place;
      label.dataset.priority = selectedId && placements.some((entry) => entry.placeId === place.id && entry.nodeId === selectedId) ? "2" : "0";
      runtime.labelLayer.appendChild(label);
    }
    for (const place of countryLabels) {
      const label = document.createElement("div") as HTMLDivElement & { place?: Place };
      label.className = "globe-place-label globe-country-label";
      label.textContent = place.name;
      label.place = { ...place, country: place.name };
      label.dataset.priority = "-1";
      runtime.labelLayer.appendChild(label);
    }

    if (selectedId) {
      const selectedPlace = placements.find((entry) => entry.nodeId === selectedId && entry.role === "musical_base")?.place;
      if (selectedPlace) {
        const connectedIds = new Set(edges.filter((edge) => edge.source === selectedId || edge.target === selectedId)
          .map((edge) => edge.source === selectedId ? edge.target : edge.source));
        const uniquePlaces = new Set<string>();
        for (const entry of placements) {
          if (!connectedIds.has(entry.nodeId) || entry.place.id === selectedPlace.id || uniquePlaces.has(entry.place.id)) continue;
          uniquePlaces.add(entry.place.id);
          runtime.arcGroup.add(arcBetween(selectedPlace, entry.place));
          if (uniquePlaces.size >= 36) break;
        }
        const birthplace = placements.find((entry) => entry.nodeId === selectedId && entry.role === "birthplace");
        if (birthplace && birthplace.place.id !== selectedPlace.id) runtime.arcGroup.add(arcBetween(selectedPlace, birthplace.place));
      }
    }
  }, [nodes, edges, placements, selectedId, year, showAll]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !selectedId) return;
    const place = placements.find((entry) => entry.nodeId === selectedId && entry.role === "musical_base")?.place
      ?? placements.find((entry) => entry.nodeId === selectedId && entry.role === "birthplace")?.place;
    if (place) runtime.flyTo = point(place.lat, place.lon, containerRef.current!.clientWidth < 600 ? 3.15 : 2.05);
  }, [selectedId, placements]);

  useEffect(() => {
    if (homeSignal > 0 && runtimeRef.current) {
      const width = containerRef.current?.clientWidth ?? 1000;
      runtimeRef.current.flyTo = point(33, -35, width < 600 ? 4.8 : 3.25);
    }
  }, [homeSignal]);

  return <div className="globe-scene" ref={containerRef} aria-label="Interactive music history globe" />;
}
