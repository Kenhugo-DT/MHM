import { ArrowLeft, Download, Focus, FlaskConical, Play, RotateCcw, Search, Sparkles, ThumbsDown, ThumbsUp, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PARAMETERS, evaluateLayout } from "../../../shared/layout-playground/experiment.mjs";
import type { PlaygroundMetrics, PlaygroundParameters, PlaygroundResult } from "../../../shared/layout-playground/experiment.mjs";
import { MAP_ZONES } from "../lib/graph-config";
import type { GraphDataset, GraphLayoutDataset, LayoutNodePosition } from "../types/graph";
import { MapCanvas, type Camera } from "./MapCanvas";

type Mode = "organized" | "genre" | "chaos";
type Verdict = "better" | "worse" | "unsure";

interface FeedbackRecord {
  id: string;
  createdAt: string;
  mode: Mode;
  zone: string;
  verdict: Verdict;
  parameters: PlaygroundParameters;
  before: PlaygroundMetrics;
  after: PlaygroundMetrics;
  note: string;
}

const STORAGE_KEY = "mhm-layout-playground-feedback-v1";
const MODES: Array<{ id: Mode; label: string }> = [
  { id: "organized", label: "Map" },
  { id: "genre", label: "Genres" },
  { id: "chaos", label: "Chaos" },
];

function storedFeedback(): FeedbackRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

function fitCamera(graph: GraphDataset, positions: Record<string, LayoutNodePosition>, zone: string): Camera {
  const points = graph.nodes.filter((node) => zone === "all" || node.zone === zone)
    .map((node) => positions[node.id]).filter(Boolean);
  if (!points.length) return { x: 0, y: 0, scale: 0.25 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const paneWidth = window.innerWidth > 980 ? Math.max(320, (window.innerWidth - 320) / 2) : window.innerWidth - 30;
  const paneHeight = window.innerWidth > 980 ? window.innerHeight * 0.58 : 380;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    scale: Math.min(0.95, Math.max(0.06, Math.min(paneWidth / (maxX - minX + 300),
      paneHeight / (maxY - minY + 230)))),
  };
}

function Metric({ label, before, after, suffix = "" }: { label: string; before: number; after?: number; suffix?: string }) {
  const delta = after === undefined ? 0 : after - before;
  return <div className="lab-metric">
    <span>{label}</span>
    <strong>{before.toLocaleString()} {after === undefined ? "" : <><b aria-hidden="true">→</b> {after.toLocaleString()}{suffix}</>}</strong>
    {after !== undefined && <small className={delta < 0 ? "good" : delta > 0 ? "bad" : ""}>
      {delta > 0 ? "+" : ""}{delta.toLocaleString()}
    </small>}
  </div>;
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void;
}) {
  return <label className="lab-slider">
    <span>{label}<output>{value.toFixed(step < 1 ? 2 : 0)}</output></span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}

export function Playground() {
  const [graph, setGraph] = useState<GraphDataset>();
  const [layouts, setLayouts] = useState<GraphLayoutDataset>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("organized");
  const [zone, setZone] = useState("rock-circuit");
  const [parameters, setParameters] = useState<PlaygroundParameters>({ ...DEFAULT_PARAMETERS });
  const [result, setResult] = useState<PlaygroundResult>();
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 0.25 });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<FeedbackRecord[]>(storedFeedback);
  const worker = useRef<Worker | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/graph.json`).then((response) => {
        if (!response.ok) throw new Error(`Graph unavailable (${response.status}).`);
        return response.json() as Promise<GraphDataset>;
      }),
      fetch(`${import.meta.env.BASE_URL}data/layouts.json`).then((response) => {
        if (!response.ok) throw new Error(`Layouts unavailable (${response.status}).`);
        return response.json() as Promise<GraphLayoutDataset>;
      }),
    ]).then(([loadedGraph, loadedLayouts]) => {
      if (cancelled) return;
      setGraph(loadedGraph);
      setLayouts(loadedLayouts);
      setCamera(fitCamera(loadedGraph, loadedLayouts.layouts.organized.nodes, "rock-circuit"));
    }).catch((reason: unknown) => { if (!cancelled) setError(String(reason)); });
    const instance = new Worker(new URL("./playground.worker.ts", import.meta.url), { type: "module" });
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<{ id: number; result?: PlaygroundResult; error?: string }>) => {
      if (event.data.id !== requestId.current) return;
      setBusy(false);
      if (event.data.error) { setError(event.data.error); return; }
      if (event.data.result) {
        setResult(event.data.result);
        setParameters(event.data.result.parameters);
      }
    };
    instance.onerror = () => { setBusy(false); setError("The experiment worker stopped unexpectedly."); };
    return () => { cancelled = true; instance.terminate(); worker.current = undefined; };
  }, []);

  const baseline = layouts?.layouts[mode].nodes;
  const before = useMemo(() => graph && baseline ? evaluateLayout(graph, baseline, baseline, zone) : undefined,
    [graph, baseline, zone]);
  const selected = graph?.nodes.find((node) => node.id === selectedId);

  function changeMode(next: Mode) {
    if (!graph || !layouts) return;
    requestId.current += 1;
    setMode(next);
    setResult(undefined);
    setCamera(fitCamera(graph, layouts.layouts[next].nodes, zone));
  }

  function changeZone(next: string) {
    if (!graph || !baseline) return;
    requestId.current += 1;
    setZone(next);
    setResult(undefined);
    setCamera(fitCamera(graph, baseline, next));
  }

  function run(auto: boolean, selectedParameters = parameters) {
    if (!graph || !baseline || !worker.current) return;
    requestId.current += 1;
    setError("");
    setBusy(true);
    worker.current.postMessage({ id: requestId.current, graph, baseline, scopeZone: zone,
      parameters: selectedParameters, auto,
      feedback: history.filter((item) => item.mode === mode && item.zone === zone)
        .map((item) => ({ verdict: item.verdict, parameters: item.parameters })),
    });
  }

  function focusSearch() {
    if (!graph || !baseline) return;
    const query = search.trim().toLocaleLowerCase("en");
    const node = graph.nodes.find((item) => item.label.toLocaleLowerCase("en") === query) ??
      graph.nodes.find((item) => item.label.toLocaleLowerCase("en").includes(query));
    if (!node || !query) return;
    if (zone !== "all" && zone !== node.zone) {
      requestId.current += 1;
      setZone(node.zone);
      setResult(undefined);
    }
    setSelectedId(node.id);
    const point = baseline[node.id];
    if (point) setCamera({ x: point.x, y: point.y, scale: Math.max(0.4, camera.scale) });
  }

  function saveFeedback(verdict: Verdict) {
    if (!result) return;
    const entry: FeedbackRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(), mode, zone, verdict,
      parameters: result.parameters, before: result.before, after: result.after, note: note.trim(),
    };
    const next = [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, 30);
    setHistory(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function exportReport() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), graphGeneratedAt: graph?.generatedAt,
      mode, zone, current: result ? { parameters: result.parameters, before: result.before,
        after: result.after, outcome: result.outcome, positions: result.positions, trials: result.trials } : null,
      feedback: history };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mhm-layout-experiment-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="lab-shell">
    <header className="lab-header">
      <div className="lab-brand"><FlaskConical size={20} aria-hidden="true" /><span><strong>MHM</strong><small>Layout Lab</small></span></div>
      <div className="lab-header-meta">{graph ? `${graph.nodes.length.toLocaleString()} nodes · ${graph.edges.length.toLocaleString()} links` : "Loading graph"}</div>
      <div className="lab-header-actions">
        <span className="lab-local">Local sandbox</span>
        <button type="button" title="Export experiment report" aria-label="Export experiment report" onClick={exportReport}><Download size={17} /></button>
        <a href="./" title="Back to map" aria-label="Back to map"><ArrowLeft size={17} /> <span>Map</span></a>
      </div>
    </header>

    <div className="lab-workspace">
      <aside className="lab-sidebar">
        <div className="lab-section"><h2>Experiment</h2>
          <div className="lab-segment" role="group" aria-label="Base layout">
            {MODES.map((item) => <button key={item.id} type="button" className={mode === item.id ? "active" : ""}
              onClick={() => changeMode(item.id)}>{item.label}</button>)}
          </div>
          <label className="lab-field">Focus zone
            <select value={zone} onChange={(event) => changeZone(event.target.value)}>
              <option value="all">Entire map</option>
              {MAP_ZONES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="lab-section lab-parameters"><h2>Brain rules</h2>
          <Slider label="Label spacing" min={0.5} max={2} step={0.05} value={parameters.spacing}
            onChange={(value) => setParameters({ ...parameters, spacing: value })} />
          <Slider label="Connection pull" min={0} max={1} step={0.05} value={parameters.connectionPull}
            onChange={(value) => setParameters({ ...parameters, connectionPull: value })} />
          <Slider label="Zone freedom" min={0} max={1} step={0.05} value={parameters.zoneFreedom}
            onChange={(value) => setParameters({ ...parameters, zoneFreedom: value })} />
          <Slider label="Iterations" min={8} max={80} step={4} value={parameters.iterations}
            onChange={(value) => setParameters({ ...parameters, iterations: value })} />
          <div className="lab-run-actions">
            <button type="button" className="lab-primary" disabled={!graph || busy} onClick={() => run(false)}><Play size={16} /> Run</button>
            <button type="button" disabled={!graph || busy} onClick={() => run(true)}><Sparkles size={16} /> Auto tune</button>
          </div>
          <button type="button" className="lab-reset" onClick={() => { setParameters({ ...DEFAULT_PARAMETERS }); setResult(undefined); }}><RotateCcw size={14} /> Reset trial</button>
        </div>
        <div className="lab-section lab-feedback"><h2>Human feedback</h2>
          <div className="lab-verdicts">
            <button type="button" disabled={!result} onClick={() => saveFeedback("better")} title="Mark this result better"><ThumbsUp size={17} /> Better</button>
            <button type="button" disabled={!result} onClick={() => saveFeedback("worse")} title="Mark this result worse"><ThumbsDown size={17} /> Worse</button>
            <button type="button" disabled={!result} onClick={() => saveFeedback("unsure")}>Unsure</button>
          </div>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed?" aria-label="Feedback note" rows={3} />
          <div className="lab-feedback-count">{history.length} saved reviews</div>
          {history.slice(0, 3).map((item) => <button key={item.id} type="button" className="lab-history"
            onClick={() => {
              if (graph && layouts) setCamera(fitCamera(graph, layouts.layouts[item.mode].nodes, item.zone));
              requestId.current += 1;
              setMode(item.mode);
              setZone(item.zone);
              setResult(undefined);
              setParameters(item.parameters);
            }}>
            <span>{item.verdict === "better" ? "↑" : item.verdict === "worse" ? "↓" : "·"} {item.zone}</span>
            <small>{item.after.score.toFixed(1)}</small>
          </button>)}
        </div>
      </aside>

      <section className="lab-main">
        <div className="lab-toolbar">
          <div className="lab-search"><Search size={16} aria-hidden="true" /><input type="search" value={search}
            placeholder="Find a node" aria-label="Find a node" onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") focusSearch(); }} />
            <button type="button" onClick={focusSearch}>Find</button></div>
          <div className="lab-zoom">
            <button type="button" title="Fit focus zone" aria-label="Fit focus zone" onClick={() => { if (graph && baseline) setCamera(fitCamera(graph, baseline, zone)); }}><Focus size={17} /></button>
            <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setCamera({ ...camera, scale: Math.max(0.06, camera.scale * 0.8) })}><ZoomOut size={17} /></button>
            <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setCamera({ ...camera, scale: Math.min(1.8, camera.scale * 1.25) })}><ZoomIn size={17} /></button>
          </div>
        </div>
        {error && <div className="lab-error" role="alert">{error}</div>}
        <div className="lab-comparison">
          <div className="lab-map-panel"><div className="lab-panel-title"><strong>Current</strong><span>{mode === "organized" ? "Map" : mode === "genre" ? "Genres" : "Chaos"}</span></div>
            {graph && baseline && <MapCanvas graph={graph} positions={baseline} camera={camera} selectedId={selectedId}
              scopeZone={zone} onCamera={setCamera} onSelect={setSelectedId} />}</div>
          <div className="lab-map-panel"><div className="lab-panel-title"><strong>Experiment</strong><span>{busy ? "Computing" : result?.outcome ?? "Ready"}</span></div>
            {graph && baseline && <MapCanvas graph={graph} positions={result?.positions ?? baseline} camera={camera}
              selectedId={selectedId} scopeZone={zone} onCamera={setCamera} onSelect={setSelectedId} />}</div>
        </div>
        <div className="lab-results">
          <div className="lab-results-heading"><h2>Comparison</h2><span className={`lab-outcome ${result?.outcome ?? ""}`}>{busy ? "Running" : result?.outcome ?? "No trial"}</span></div>
          {before && <div className="lab-metrics">
            <Metric label="Text overlaps" before={before.overlaps} after={result?.after.overlaps} />
            <Metric label="Severe" before={before.severeOverlaps} after={result?.after.severeOverlaps} />
            <Metric label="Mean link" before={before.meanEdge} after={result?.after.meanEdge} suffix="" />
            <Metric label="Long links" before={before.longEdges} after={result?.after.longEdges} />
            <Metric label="Mean movement" before={0} after={result?.after.meanDrift} />
            <Metric label="Score" before={before.score} after={result?.after.score} />
          </div>}
          {result?.trials && <div className="lab-trials">{result.trials.map((trial, index) => <span key={index}
            className={trial.parameters.spacing === result.parameters.spacing && trial.parameters.connectionPull === result.parameters.connectionPull ? "chosen" : ""}
            title={`Spacing ${trial.parameters.spacing}, pull ${trial.parameters.connectionPull}, freedom ${trial.parameters.zoneFreedom}`}>
            {index + 1}: {trial.after.score.toFixed(1)}
          </span>)}</div>}
          {selected && <div className="lab-selection"><strong>{selected.label}</strong><span>{selected.type} · {selected.zone}</span></div>}
        </div>
      </section>
    </div>
  </main>;
}
