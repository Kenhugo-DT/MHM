import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Focus,
  Home,
  LoaderCircle,
  Map as MapIcon,
  Search,
  Shuffle,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GraphMapHandle } from "./components/GraphMap";
import { createGraphRepository } from "./data/repository";
import {
  fetchWikiActionContextForNode,
  type WikiActionContext,
  type WikiCandidateKind,
} from "./data/wiki-candidates";
import {
  fetchWikiDetailForNode,
  type WikiDetail,
} from "./data/wiki-details";
import {
  BROWSE_ROUTES,
  MODE_LABELS,
  MODE_TYPES,
  NODE_COLORS,
  NODE_LABELS,
  colorToCss,
  modeForType,
} from "./lib/graph-config";
import type {
  BrowseRoute,
  GraphEdge,
  GraphNode,
  MapMode,
  NodeType,
} from "./types/graph";

const repository = createGraphRepository();
const backgroundUrl = `${import.meta.env.BASE_URL}images/backgrounds/gitarside-v2-background.webp`;
const logoUrl = new URL("../images/logos/gitarlogo-small.png", import.meta.url).href;
const GraphMap = lazy(() =>
  import("./components/GraphMap").then((module) => ({ default: module.GraphMap })),
);

function initialMode(): MapMode {
  return new URLSearchParams(window.location.search).get("map") === "guitars"
    ? "guitars"
    : "artists";
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [next[index], next[random]] = [next[random], next[index]];
  }
  return next;
}

function edgeForNode(edge: GraphEdge, nodeId: string): string {
  return edge.source === nodeId ? edge.target : edge.source;
}

function candidateLabel(kind: WikiCandidateKind): string {
  return kind === "unknown" ? "Wiki page" : NODE_LABELS[kind];
}

function candidateColor(kind: WikiCandidateKind): string {
  return kind === "unknown" ? "#756d64" : colorToCss(NODE_COLORS[kind]);
}

interface DetailTextSection {
  title: string;
  sentences: string[];
}

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return (
    normalized.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [normalized]
  )
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function buildDetailTextSections(text: string): DetailTextSection[] {
  const sentences = splitSentences(text);
  const sections: DetailTextSection[] = [];

  const sectionSpecs = [
    { title: "Overview", sentences: sentences.slice(0, 2) },
    { title: "Context", sentences: sentences.slice(2, 4) },
    { title: "Further reading", sentences: sentences.slice(4) },
  ];

  for (const section of sectionSpecs) {
    if (section.sentences.length === 0) continue;
    sections.push({
      title: section.title,
      sentences: section.sentences,
    });
  }

  return sections;
}

export default function App() {
  const mapRef = useRef<GraphMapHandle>(null);
  const [mode, setMode] = useState<MapMode>(initialMode);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<GraphNode>();
  const [wikiDetail, setWikiDetail] = useState<WikiDetail>();
  const [wikiContext, setWikiContext] = useState<WikiActionContext>();
  const [wikiContextLoading, setWikiContextLoading] = useState(false);
  const [showFullDetail, setShowFullDetail] = useState(false);
  const [detailNodes, setDetailNodes] = useState<GraphNode[]>([]);
  const [detailEdges, setDetailEdges] = useState<GraphEdge[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);
  const [starterNodes, setStarterNodes] = useState<GraphNode[]>([]);
  const [activeRoute, setActiveRoute] = useState<BrowseRoute>();
  const [routeIndex, setRouteIndex] = useState(0);
  const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(
    () => new Set(MODE_TYPES[initialMode()]),
  );

  const nodeById = useMemo(
    () => new Map([...nodes, ...detailNodes].map((node) => [node.id, node])),
    [detailNodes, nodes],
  );

  const routes = useMemo(
    () =>
      BROWSE_ROUTES.filter((route) => {
        if (route.mode) return route.mode === mode;
        const first = nodeById.get(route.nodeIds[0]);
        if (first) return MODE_TYPES[mode].has(first.type);
        return mode === "guitars"
          ? route.id.includes("gibson") ||
              route.id.includes("stratocaster") ||
              route.id.includes("acoustic")
          : !route.id.includes("gibson") &&
              !route.id.includes("stratocaster") &&
              !route.id.includes("acoustic");
      }),
    [mode, nodeById],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setVisibleTypes(new Set(MODE_TYPES[mode]));

    repository
      .loadMap(mode)
      .then((graph) => {
        if (cancelled) return;
        setNodes(graph.nodes);
        setEdges(graph.edges);
        const candidates = graph.nodes.filter((node) => node.starter);
        setStarterNodes(shuffle(candidates.length >= 6 ? candidates : graph.nodes).slice(0, 6));
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not load the map.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      repository.search(query).then((results) => {
        if (!cancelled) setSearchResults(results);
      });
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const selectNode = useCallback(
    async (node: GraphNode, route?: BrowseRoute, index = 0) => {
      const nextMode = node.type === "genre" ? mode : modeForType(node.type);
      if (nextMode !== mode) setMode(nextMode);
      setSelected(node);
      setSearchQuery("");
      setSearchResults([]);
      setActiveRoute(route);
      setRouteIndex(index);

      const params = new URLSearchParams(window.location.search);
      params.set("map", nextMode);
      params.set("node", node.id);
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);

      try {
        const graph = await repository.loadNeighborhood(node.id, 1);
        setDetailNodes(graph.nodes);
        setDetailEdges(graph.edges);
      } catch {
        setDetailNodes([node]);
        setDetailEdges([]);
      }
    },
    [mode],
  );

  useEffect(() => {
    const nodeId = new URLSearchParams(window.location.search).get("node");
    if (!nodeId || selected) return;
    const local = nodes.find((node) => node.id === nodeId);
    if (local) {
      void selectNode(local);
      return;
    }

    repository.loadNeighborhood(nodeId).then((graph) => {
      const center = graph.nodes.find((node) => node.id === nodeId);
      if (center) void selectNode(center);
    });
  }, [nodes, selectNode, selected]);

  useEffect(() => {
    let cancelled = false;
    setWikiDetail(undefined);
    if (!selected) return;

    fetchWikiDetailForNode(selected)
      .then((detail) => {
        if (!cancelled) setWikiDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setWikiDetail(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    setWikiContext(undefined);
    setWikiContextLoading(Boolean(selected));
    if (!selected) return;

    fetchWikiActionContextForNode(selected)
      .then((context) => {
        if (!cancelled) setWikiContext(context);
      })
      .catch(() => {
        if (!cancelled) setWikiContext(undefined);
      })
      .finally(() => {
        if (!cancelled) setWikiContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const selectedConnections = useMemo(() => {
    if (!selected) return [];
    return detailEdges
      .filter((edge) => edge.source === selected.id || edge.target === selected.id)
      .map((edge) => ({ edge, node: nodeById.get(edgeForNode(edge, selected.id)) }))
      .filter((item): item is { edge: GraphEdge; node: GraphNode } => Boolean(item.node))
      .sort((a, b) => b.edge.strength - a.edge.strength);
  }, [detailEdges, nodeById, selected]);

  const detailImage = useMemo<GraphNode["image"]>(() => {
    if (!selected) return undefined;
    if (selected.image) return selected.image;
    if (!wikiDetail?.thumbnailUrl) return undefined;

    return {
      url: wikiDetail.thumbnailUrl,
      thumbnailUrl: wikiDetail.thumbnailUrl,
      alt: `${wikiDetail.title} image`,
      sourceUrl: wikiDetail.url,
    };
  }, [selected, wikiDetail]);

  const detailSummary = wikiDetail?.extract || selected?.summary || "";
  const detailTextSections = useMemo(
    () => buildDetailTextSections(detailSummary),
    [detailSummary],
  );
  const visibleDetailTextSections = showFullDetail
    ? detailTextSections
    : detailTextSections.slice(0, 2);
  const hiddenDetailTextCount = Math.max(
    0,
    detailTextSections.length - visibleDetailTextSections.length,
  );

  const detailSources = useMemo(() => {
    if (!selected) return [];
    const sources = [...selected.sources];
    if (wikiDetail && !sources.some((source) => source.url === wikiDetail.url)) {
      sources.unshift({
        label: `Wikipedia (${wikiDetail.language.toUpperCase()})`,
        url: wikiDetail.url,
        provider: "wikipedia" as const,
        retrievedAt: wikiDetail.retrievedAt,
      });
    }
    return sources;
  }, [selected, wikiDetail]);

  const handleMapSelect = useCallback(
    (node: GraphNode) => {
      void selectNode(node);
    },
    [selectNode],
  );

  useEffect(() => {
    setShowFullDetail(false);
  }, [selected?.id]);

  function changeMode(nextMode: MapMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setSelected(undefined);
    setActiveRoute(undefined);
    setDetailNodes([]);
    setDetailEdges([]);
    const params = new URLSearchParams(window.location.search);
    params.set("map", nextMode);
    params.delete("node");
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }

  function resetMap() {
    setSelected(undefined);
    setActiveRoute(undefined);
    setDetailNodes([]);
    setDetailEdges([]);
    setStarterNodes(shuffle(nodes.filter((node) => node.starter)).slice(0, 6));
    const params = new URLSearchParams(window.location.search);
    params.set("map", mode);
    params.delete("node");
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    mapRef.current?.fit();
  }

  function randomNode() {
    const candidates = nodes.filter((node) => visibleTypes.has(node.type));
    const node = candidates[Math.floor(Math.random() * candidates.length)];
    if (node) void selectNode(node);
  }

  function startRoute(route: BrowseRoute) {
    const first = nodeById.get(route.nodeIds[0]);
    if (first) void selectNode(first, route, 0);
  }

  function stepRoute(direction: -1 | 1) {
    if (!activeRoute) return;
    const nextIndex = Math.max(
      0,
      Math.min(activeRoute.nodeIds.length - 1, routeIndex + direction),
    );
    const nextId = activeRoute.nodeIds[nextIndex];
    const known = nodeById.get(nextId);
    if (known) {
      void selectNode(known, activeRoute, nextIndex);
      return;
    }
    repository.loadNeighborhood(nextId).then((graph) => {
      const next = graph.nodes.find((node) => node.id === nextId);
      if (next) void selectNode(next, activeRoute, nextIndex);
    });
  }

  function toggleType(type: NodeType) {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type) && next.size > 1) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <main className="app-shell">
      <div className="background-plate" aria-hidden="true">
        <img src={backgroundUrl} alt="" decoding="async" />
      </div>
      <Suspense fallback={<div className="map-loading-plate" aria-hidden="true" />}>
        <GraphMap
          ref={mapRef}
          nodes={nodes}
          edges={edges}
          mode={mode}
          selectedId={selected?.id}
          routeNodeIds={activeRoute?.nodeIds}
          visibleTypes={visibleTypes}
          onSelect={handleMapSelect}
        />
      </Suspense>

      <header className="topbar" aria-label="Map controls">
        <button
          className="brand"
          type="button"
          onClick={resetMap}
          title="Music History Map home"
          aria-label="Music History Map home"
        >
          <img src={logoUrl} alt="" />
          <span className="brand-copy">
            <strong>MHM</strong>
            <small>Music History Map</small>
          </span>
        </button>

        <div className="mode-switch" aria-label="Map mode">
          {(["artists", "guitars"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              className={choice === mode ? "active" : ""}
              onClick={() => changeMode(choice)}
            >
              {MODE_LABELS[choice]}
            </button>
          ))}
        </div>

        <div className="search-control">
          <Search aria-hidden="true" size={17} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search the entire map..."
            aria-label="Search the entire map"
          />
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((node) => (
                <button key={node.id} type="button" onClick={() => void selectNode(node)}>
                  <span
                    className="type-dot"
                    style={{ background: colorToCss(NODE_COLORS[node.type]) }}
                  />
                  <span>{node.label}</span>
                  <small>{NODE_LABELS[node.type]}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="top-actions">
          <button type="button" onClick={() => mapRef.current?.fit()} title="Fit map">
            <Focus aria-hidden="true" size={18} />
          </button>
          <button type="button" onClick={randomNode} title="Random node">
            <Shuffle aria-hidden="true" size={18} />
          </button>
          <button type="button" onClick={resetMap} title="Home">
            <Home aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      <section className="map-legend" aria-label="Visible node types">
        {[...MODE_TYPES[mode]].map((type) => (
          <button
            key={type}
            type="button"
            className={visibleTypes.has(type) ? "active" : ""}
            onClick={() => toggleType(type)}
          >
            <span style={{ background: colorToCss(NODE_COLORS[type]) }} />
            {NODE_LABELS[type]}
          </button>
        ))}
      </section>

      {!selected && !loading && !error && (
        <section className="start-panel">
          <div className="panel-heading">
            <div>
              <p>MUSIC HISTORY MAP</p>
              <h1>Start somewhere</h1>
            </div>
            <MapIcon aria-hidden="true" size={24} />
          </div>

          <div className="starter-grid">
            {starterNodes.map((node) => (
              <button key={node.id} type="button" onClick={() => void selectNode(node)}>
                <span
                  className="starter-rail"
                  style={{ background: colorToCss(NODE_COLORS[node.type]) }}
                />
                <span>
                  <strong>{node.label}</strong>
                  <small>{NODE_LABELS[node.type]}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="route-section">
            <div className="section-label">
              <span>Browse routes</span>
              <button
                type="button"
                onClick={() =>
                  setStarterNodes(shuffle(nodes.filter((node) => node.starter)).slice(0, 6))
                }
                title="New starting points"
              >
                <Shuffle aria-hidden="true" size={15} />
              </button>
            </div>
            <div className="route-list">
              {routes.map((route) => (
                <button key={route.id} type="button" onClick={() => startRoute(route)}>
                  <span
                    className="route-rail"
                    style={{ background: colorToCss(route.color) }}
                  />
                  <span>
                    <strong>{route.name}</strong>
                    <small>{route.description}</small>
                  </span>
                  <ChevronRight aria-hidden="true" size={17} />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {loading && (
        <div className="loading-state">
          <LoaderCircle aria-hidden="true" className="spin" size={20} />
          Loading {MODE_LABELS[mode].toLowerCase()} map
        </div>
      )}

      {error && (
        <div className="error-state">
          <strong>The map could not be loaded.</strong>
          <span>{error}</span>
        </div>
      )}

      {selected && (
        <aside className="detail-panel" aria-live="polite">
          <button
            className="close-button"
            type="button"
            onClick={() => {
              setSelected(undefined);
              setActiveRoute(undefined);
              resetMap();
            }}
            title="Close details"
          >
            <X aria-hidden="true" size={19} />
          </button>

          {detailImage && (
            <figure className="entity-image">
              <img
                src={detailImage.thumbnailUrl ?? detailImage.url}
                alt={detailImage.alt}
              />
              {detailImage.creator && (
                <figcaption>
                  {detailImage.creator}
                  {detailImage.license ? `, ${detailImage.license}` : ""}
                </figcaption>
              )}
            </figure>
          )}

          <p
            className="detail-type"
            style={{ color: colorToCss(NODE_COLORS[selected.type]) }}
          >
            {NODE_LABELS[selected.type]}
          </p>
          <h2>{selected.label}</h2>
          <div className="detail-summary" aria-label={`${selected.label} overview`}>
            {visibleDetailTextSections.length > 0 ? (
              visibleDetailTextSections.map((section, index) => (
                <section className="summary-chunk" key={`${section.title}-${index}`}>
                  <h3>{section.title}</h3>
                  {section.sentences.map((sentence) => (
                    <p key={sentence}>{sentence}</p>
                  ))}
                </section>
              ))
            ) : (
              <p className="empty-copy">No summary available yet.</p>
            )}
            {hiddenDetailTextCount > 0 && (
              <button
                className="summary-toggle"
                type="button"
                onClick={() => setShowFullDetail((current) => !current)}
              >
                {showFullDetail ? (
                  <>
                    Show less <ChevronUp aria-hidden="true" size={16} />
                  </>
                ) : (
                  <>
                    Read more <ChevronDown aria-hidden="true" size={16} />
                  </>
                )}
              </button>
            )}
          </div>

          {selected.metadata.length > 0 && (
            <div className="metadata-list">
              {selected.metadata.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}

          {activeRoute && (
            <section className="route-progress">
              <div>
                <strong>{activeRoute.name}</strong>
                <span>
                  {routeIndex + 1} / {activeRoute.nodeIds.length}
                </span>
              </div>
              <div>
                <button
                  type="button"
                  disabled={routeIndex === 0}
                  onClick={() => stepRoute(-1)}
                >
                  <ChevronLeft aria-hidden="true" size={17} />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={routeIndex === activeRoute.nodeIds.length - 1}
                  onClick={() => stepRoute(1)}
                >
                  Next
                  <ChevronRight aria-hidden="true" size={17} />
                </button>
              </div>
            </section>
          )}

          <section className="detail-section">
            <h3>Connections</h3>
            <div className="connection-list">
              {selectedConnections.length ? (
                selectedConnections.slice(0, 14).map(({ edge, node }) => (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => void selectNode(node)}
                  >
                    <span
                      className="type-dot"
                      style={{ background: colorToCss(NODE_COLORS[node.type]) }}
                    />
                    <span>
                      <strong>{node.label}</strong>
                      <small>
                        {edge.label}
                        {edge.context.length ? ` · ${edge.context.join(", ")}` : ""}
                      </small>
                    </span>
                    <ChevronRight aria-hidden="true" size={16} />
                  </button>
                ))
              ) : (
                <p className="empty-copy">No documented connections yet.</p>
              )}
            </div>
          </section>

          {(wikiContextLoading || wikiContext?.candidates.length) && (
            <section className="detail-section">
              <h3>Wikipedia signals</h3>
              <div className="wiki-signal-list">
                {wikiContextLoading && !wikiContext ? (
                  <p className="empty-copy">Reading Wikipedia links...</p>
                ) : (
                  wikiContext?.candidates.map((candidate) => (
                    <a
                      key={`${candidate.source}-${candidate.title}`}
                      href={candidate.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span
                        className="type-dot"
                        style={{ background: candidateColor(candidate.kind) }}
                      />
                      <span>
                        <strong>{candidate.title}</strong>
                        <small>
                          {candidateLabel(candidate.kind)} · {candidate.reason}
                        </small>
                      </span>
                      <ExternalLink aria-hidden="true" size={14} />
                    </a>
                  ))
                )}
              </div>
            </section>
          )}

          {detailSources.length > 0 && (
            <section className="detail-section source-list">
              <h3>Sources</h3>
              {detailSources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.label}
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              ))}
            </section>
          )}
        </aside>
      )}

      <footer className="map-status">
        <span>{nodes.length} nodes</span>
        <span>{edges.length} documented links</span>
        <span>{repository.source === "local" ? "Curated preview data" : "Live database"}</span>
      </footer>
    </main>
  );
}
