import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createGraphRepository } from "../data/repository";
import { NODE_COLORS, NODE_LABELS, colorToCss, modeForType } from "../lib/graph-config";
import type { GraphNode, NodeType } from "../types/graph";

const repository = createGraphRepository();
const PAGE_SIZE = 80;
const TYPES: NodeType[] = ["band", "artist", "guitarist", "genre", "guitar", "guitar_brand"];
const collator = new Intl.Collator("en", { sensitivity: "base" });

export function Directory() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<NodeType | "all">("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([repository.loadMap("artists"), repository.loadMap("guitars")])
      .then((maps) => {
        if (!active) return;
        setNodes([...new Map(maps.flatMap((map) => map.nodes).map((node) => [node.id, node])).values()]);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en");
    return nodes.filter((node) => (type === "all" || node.type === type) &&
      (!needle || [node.label, ...(node.aliases ?? [])]
        .some((value) => value.toLocaleLowerCase("en").includes(needle))))
      .sort((a, b) => collator.compare(a.label, b.label) || a.id.localeCompare(b.id));
  }, [nodes, query, type]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return <main className="directory-shell">
    <header className="directory-topbar">
      <a href="./" className="directory-back" aria-label="Back to map"><ArrowLeft size={17} /> Map</a>
      <div className="directory-brand"><strong>MHM</strong><span>Music History Map</span></div>
    </header>
    <div className="directory-content">
      <div className="directory-heading"><div><span>Music history map</span><h1>Nodes</h1></div>
        <output aria-live="polite">{loading ? "Loading" : `${filtered.length.toLocaleString()} of ${nodes.length.toLocaleString()}`}</output></div>
      <div className="directory-toolbar">
        <label className="directory-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search nodes</span>
          <input type="search" value={query} placeholder="Search nodes" onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        <label className="directory-type">Type
          <select value={type} onChange={(event) => { setType(event.target.value as NodeType | "all"); setPage(0); }}>
            <option value="all">All types</option>
            {TYPES.map((item) => <option key={item} value={item}>{NODE_LABELS[item]}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="directory-error" role="alert">{error}</p>}
      {!loading && !error && <>
        <ul className="directory-list">
          {visible.map((node) => <li key={node.id}>
            <a href={`./?map=${modeForType(node.type)}&node=${encodeURIComponent(node.id)}`}>
              <span className="directory-dot" style={{ background: colorToCss(NODE_COLORS[node.type]) }} aria-hidden="true" />
              <span className="directory-entry"><strong>{node.label}</strong><span>{node.summary}</span></span>
              <span className="directory-meta"><span>{NODE_LABELS[node.type]}</span>{node.eraStart && <span>{node.eraStart}</span>}</span>
            </a>
          </li>)}
        </ul>
        {filtered.length === 0 && <p className="directory-empty">No matching nodes.</p>}
        {pageCount > 1 && <nav className="directory-pagination" aria-label="Result pages">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page" title="Previous page"><ChevronLeft size={17} /></button>
          <span>Page {page + 1} of {pageCount}</span>
          <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} aria-label="Next page" title="Next page"><ChevronRight size={17} /></button>
        </nav>}
      </>}
    </div>
  </main>;
}
