import { ArrowLeft, ExternalLink, Globe2, Home, MapPin, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GlobeScene, type Placement } from "./InteractiveGlobeScene";
import { loadFacts, loadGlobeData, type GlobeData, type GlobeFact } from "./data";
import { buildGeography } from "./geography.mjs";

const typeLabels: Record<string, string> = {
  band: "Band", artist: "Artist", guitarist: "Guitarist", genre: "Genre",
  guitar: "Guitar", guitar_brand: "Guitar brand",
};

function sourceLink(source: { label: string; url: string }, index: number) {
  return <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">
    {source.label}<ExternalLink aria-hidden="true" size={12} />
  </a>;
}

export function GlobeApp() {
  const [data, setData] = useState<GlobeData>();
  const [sourceBacked, setSourceBacked] = useState<Placement[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [showAll, setShowAll] = useState(false);
  const [homeSignal, setHomeSignal] = useState(0);
  const [year, setYear] = useState(1977);
  const [facts, setFacts] = useState<GlobeFact[]>([]);

  const refresh = () => {
    setLoading(true);
    setError("");
    const geography = fetch(`${import.meta.env.BASE_URL}data/geography.json`).then(async (response) => {
      if (!response.ok) throw new Error(`Geography data unavailable (${response.status}).`);
      return (await response.json() as { placements: Placement[] }).placements;
    });
    void Promise.all([loadGlobeData(), geography]).then(([nextData, nextGeography]) => {
      setData(nextData);
      setSourceBacked(nextGeography);
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Unable to load music history.");
    }).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!selectedId) { setFacts([]); return; }
    let active = true;
    void loadFacts(selectedId).then((next) => { if (active) setFacts(next); });
    return () => { active = false; };
  }, [selectedId]);

  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const placements = useMemo(() => buildGeography(nodes, sourceBacked) as Placement[], [nodes, sourceBacked]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const primary = selectedId ? placements.find((entry) => entry.nodeId === selectedId && entry.role === "musical_base") : undefined;
  const birthplace = selectedId ? placements.find((entry) => entry.nodeId === selectedId && entry.role === "birthplace") : undefined;
  const connections = selectedId
    ? edges.filter((edge) => edge.source === selectedId || edge.target === selectedId)
      .map((edge) => ({ edge, node: byId.get(edge.source === selectedId ? edge.target : edge.source) }))
      .filter((entry) => entry.node)
    : [];
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (term.length < 2) return [];
    return nodes.filter((node) => [node.label, ...(node.aliases ?? [])].some((name) => name.toLocaleLowerCase().includes(term)))
      .sort((a, b) => Number(b.label.toLocaleLowerCase().startsWith(term)) - Number(a.label.toLocaleLowerCase().startsWith(term)) || a.label.localeCompare(b.label))
      .slice(0, 12);
  }, [nodes, query]);
  const mapped = new Set(placements.map((entry) => entry.nodeId)).size;

  const choose = (nodeId: string) => {
    setFacts([]);
    setSelectedId(nodeId);
    setQuery("");
  };

  return <div className="globe-app">
    <header className="globe-header">
      <a className="globe-back" href="./index.html" aria-label="Back to music map" title="Back to music map"><ArrowLeft size={18} /></a>
      <div className="globe-brand"><Globe2 size={20} aria-hidden="true" /><span><strong>MHM</strong><small>GEOGRAPHY</small></span></div>
      <div className="globe-search">
        <Search size={17} aria-hidden="true" />
        <input aria-label="Search all music history" placeholder="Search the map..." value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" title="Clear search" aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></button>}
        {results.length > 0 && <div className="globe-search-results">
          {results.map((node) => <button type="button" key={node.id} onClick={() => choose(node.id)}>
            <span>{node.label}</span><small>{typeLabels[node.type] ?? node.type}</small>
          </button>)}
        </div>}
      </div>
      <label className="globe-all-toggle"><input type="checkbox" aria-label="Show all nodes" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /><span>Show all</span></label>
      <button className="globe-refresh" type="button" title="Show full globe" aria-label="Show full globe" onClick={() => { setSelectedId(undefined); setHomeSignal((value) => value + 1); }}><Home size={17} /></button>
      <button className="globe-refresh" type="button" title="Refresh data" aria-label="Refresh data" onClick={refresh} disabled={loading}><RefreshCw size={17} /></button>
    </header>

    <main className="globe-main">
      <section className="globe-stage" aria-label="Geographic map of music history">
        <GlobeScene nodes={nodes} edges={edges} placements={placements} selectedId={selectedId} homeSignal={homeSignal} year={year} showAll={showAll} onPick={choose} />
        <div className="globe-stage-heading"><span>GLOBAL ATLAS</span><strong>{selected ? selected.label : "Music history"}</strong></div>
        <div className="globe-stage-count">{mapped} placed · {nodes.length} in graph · {data?.source === "live" ? "live" : "published"}</div>
        {loading && !data && <div className="globe-loading">Loading geography...</div>}
        {error && <div className="globe-loading" role="alert">{error}</div>}
        <div className="globe-time">
          <div><span>TIME / DOCUMENTED STARTS</span><output htmlFor="globe-year">{year}</output></div>
          <input id="globe-year" aria-label="Highlight start year" type="range" min="1700" max="2026" step="1" value={year} onChange={(event) => setYear(Number(event.target.value))} />
          <small>Start-year highlights only. Releases, charts and concerts need sourced event data.</small>
        </div>
      </section>

      <aside className="globe-detail" aria-label="Selection details">
        {selected && <button className="globe-detail-close" type="button" title="Close details" aria-label="Close details" onClick={() => setSelectedId(undefined)}><X size={17} /></button>}
        {selected ? <>
          <div className="globe-detail-head">
            <span>{typeLabels[selected.type] ?? selected.type}</span>
            <h1>{selected.label}</h1>
            <p>{selected.summary || "No summary available."}</p>
          </div>
          {selected.image?.url && <a className="globe-detail-image" href={selected.image.sourceUrl || selected.image.url} target="_blank" rel="noreferrer"><img src={selected.image.url} alt={selected.image.alt || selected.label} loading="lazy" /></a>}
          <div className="globe-detail-section">
            <h2>Geography</h2>
            {primary ? <div className="globe-place-row"><MapPin size={15} /><span>Musical base</span><strong>{primary.place.name}, {primary.place.country}</strong><a href={primary.evidenceUrl} target="_blank" rel="noreferrer" title="Location source"><ExternalLink size={14} /></a></div>
              : <p className="globe-muted">No documented musical base has been placed yet.</p>}
            {birthplace && birthplace.placeId !== primary?.placeId && <div className="globe-place-row birthplace"><MapPin size={15} /><span>Birthplace</span><strong>{birthplace.place.name}, {birthplace.place.country}</strong><a href={birthplace.evidenceUrl} target="_blank" rel="noreferrer" title="Birthplace source"><ExternalLink size={14} /></a></div>}
            {(primary?.note || birthplace?.note) && <p className="globe-muted">{primary?.note ?? birthplace?.note}</p>}
            {(primary?.coordinateSource || birthplace?.coordinateSource) && <div className="globe-sources globe-place-sources">
              <a href={primary?.coordinateSource ?? birthplace?.coordinateSource} target="_blank" rel="noreferrer">Map point<ExternalLink size={12} /></a>
              {(primary?.identitySource || birthplace?.identitySource) && <a href={primary?.identitySource ?? birthplace?.identitySource} target="_blank" rel="noreferrer">Identity check<ExternalLink size={12} /></a>}
            </div>}
            {(primary?.identityNote || birthplace?.identityNote) && <p className="globe-muted">{primary?.identityNote ?? birthplace?.identityNote}</p>}
            {selected.eraStart && <p className="globe-muted">Documented start: {selected.eraStart}</p>}
          </div>
          {facts.length > 0 && <div className="globe-detail-section"><h2>Did you know</h2>{facts.map((fact) => <div key={fact.id} className="globe-fact"><p>{fact.text}</p><div className="globe-sources">{fact.sources.map(sourceLink)}</div></div>)}</div>}
          <div className="globe-detail-section"><h2>Connections <span>{connections.length}</span></h2><div className="globe-relations">
            {connections.map(({ edge, node }) => <button type="button" key={edge.id} onClick={() => choose(node!.id)}><span><strong>{node!.label}</strong><small>{edge.label || edge.type.replaceAll("_", " ")}</small></span><span className={placements.some((entry) => entry.nodeId === node!.id) ? "on-globe" : "off-globe"}>{placements.some((entry) => entry.nodeId === node!.id) ? "●" : "○"}</span></button>)}
            {connections.length === 0 && <p className="globe-muted">No documented connections yet.</p>}
          </div></div>
          <div className="globe-detail-section"><h2>Sources</h2><div className="globe-sources">{selected.sources.map(sourceLink)}</div></div>
        </> : <>
          <div className="globe-detail-head"><span>MUSIC HISTORY MAP</span><h1>Geography</h1><p>{nodes.length} nodes share this atlas. {mapped} currently have a sourced geographic anchor; the rest remain available through search.</p></div>
          <div className="globe-detail-section"><h2>Coverage</h2><p className="globe-muted">Markers follow named source locations; precision varies. The globe does not infer birthplaces, recording locations or concerts from genre or proximity.</p></div>
          <div className="globe-detail-section"><h2>In the graph</h2><div className="globe-type-list">{Object.entries(typeLabels).map(([type, label]) => <div key={type}><span>{label}</span><strong>{nodes.filter((node) => node.type === type).length}</strong></div>)}</div></div>
        </>}
      </aside>
    </main>
  </div>;
}
