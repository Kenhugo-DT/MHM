import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMapConnection } from "../../shared/graph-schema/edge-evidence.mjs";
import {
  ALLOWED_NODE_TYPES,
  coerceOptionalNumber,
  coerceStringArray,
  entityFiles,
  parseFrontmatter,
} from "./obsidian-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(scriptDir, "..");
const graphPath = path.join(brainRoot, "data", "approved", "graph.json");
const vaultRoot = path.join(brainRoot, "obsidian");
const modelPath = path.join(brainRoot, "data", "approved", "learning-model.json");
const feedbackPath = path.join(brainRoot, "data", "approved", "curator-feedback.json");
const factBatchRoot = path.join(brainRoot, "data", "fact-batches");
const approvedFactEvidencePath = path.join(brainRoot, "data", "approved", "fact-evidence.json");
const curatedFactsPath = path.resolve(brainRoot, "..", "shared", "facts", "curated.json");
const reportPath = path.join(brainRoot, "data", "runs", "learning-report.md");

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "artist",
  "artists",
  "band",
  "bands",
  "by",
  "brain",
  "for",
  "from",
  "genre",
  "genres",
  "guitar",
  "guitars",
  "guitarist",
  "guitarists",
  "in",
  "into",
  "music",
  "musician",
  "musicians",
  "of",
  "on",
  "or",
  "research",
  "research brain",
  "rock",
  "singer",
  "songwriter",
  "the",
  "to",
  "with",
]);

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function addWeighted(map, key, amount) {
  const normalized = normalize(key);
  if (!normalized || STOP_WORDS.has(normalized)) return;
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function mergeUnique(...arrays) {
  const values = [];
  const seen = new Set();
  for (const array of arrays) {
    for (const value of array ?? []) {
      const text = String(value ?? "").trim();
      const key = normalize(text);
      if (!text || seen.has(key)) continue;
      seen.add(key);
      values.push(text);
    }
  }
  return values;
}

function coerceNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function median(values) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function yearsFromText(value) {
  return [...String(value ?? "").matchAll(/\b(19[2-9]\d|20[0-2]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1920 && year <= 2026);
}

function frontmatterById() {
  const notes = new Map();
  const warnings = [];

  for (const filePath of entityFiles(vaultRoot)) {
    const data = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
    const id = String(data.id ?? "").trim();
    const type = String(data.type ?? "").trim();

    if (!id) {
      warnings.push(`Skipped note without id: ${filePath}`);
      continue;
    }
    if (!ALLOWED_NODE_TYPES.has(type)) {
      warnings.push(`Skipped ${id} with unsupported type "${type}".`);
      continue;
    }

    notes.set(id, {
      ...data,
      id,
      type,
      zone: String(data.zone ?? "").trim(),
      aliases: coerceStringArray(data.aliases),
      primaryGenres: coerceStringArray(data.primaryGenres),
      curatorTags: coerceStringArray(data.curatorTags),
      secondaryZones: coerceStringArray(data.secondaryZones),
      eraStart: coerceOptionalNumber(data.eraStart),
      eraPeak: coerceOptionalNumber(data.eraPeak),
      layoutPinned: Boolean(data.layoutPinned),
      layoutX: coerceOptionalNumber(data.layoutX),
      layoutY: coerceOptionalNumber(data.layoutY),
    });
  }

  return { notes, warnings };
}

function feedbackById(graph) {
  const payload = fs.existsSync(feedbackPath)
    ? JSON.parse(fs.readFileSync(feedbackPath, "utf8"))
    : { nodeFeedback: [], zoneFeedback: [], rules: [] };
  const nodeById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const idByLabel = new Map((graph.nodes ?? []).map((node) => [normalize(node.label), node.id]));
  const feedback = new Map();
  const factNotes = [];
  const batches = new Map();
  const warnings = [];

  for (const item of payload.nodeFeedback ?? []) {
    const directId = String(item.id ?? "").trim();
    const labelId = idByLabel.get(normalize(item.label));
    const id = directId || labelId;

    if (!id || !nodeById.has(id)) {
      warnings.push(`Skipped feedback for unknown node: ${item.label || item.id || "unnamed"}`);
      continue;
    }

    feedback.set(id, {
      id,
      label: item.label,
      zone: String(item.zone ?? "").trim(),
      primaryGenres: coerceStringArray(item.primaryGenres),
      curatorTags: coerceStringArray(item.curatorTags),
      secondaryZones: coerceStringArray(item.secondaryZones),
      eraStart: coerceOptionalNumber(item.eraStart),
      eraPeak: coerceOptionalNumber(item.eraPeak),
      layoutPinned: item.layoutPinned === undefined ? undefined : Boolean(item.layoutPinned),
      layoutX: coerceNumber(item.layoutX),
      layoutY: coerceNumber(item.layoutY),
      bridgeBoost: coerceNumber(item.bridgeBoost) ?? 0,
      hubBoost: coerceNumber(item.hubBoost) ?? 0,
      feedback: String(item.feedback ?? "").trim(),
    });
  }

  for (const item of payload.factFeedback ?? []) {
    const batchId = String(item.batchId ?? "");
    const index = Number(item.factIndex);
    const ref = `${batchId}#${index}`;
    if (!/^[a-z0-9-]+$/.test(batchId) || !Number.isInteger(index) || index < 1) {
      warnings.push(`Skipped invalid fact note reference: ${ref}`);
      continue;
    }
    if (!batches.has(batchId)) {
      const batchPath = path.join(factBatchRoot, `${batchId}.json`);
      batches.set(batchId, fs.existsSync(batchPath)
        ? JSON.parse(fs.readFileSync(batchPath, "utf8"))
        : null);
    }
    const batch = batches.get(batchId);
    const entry = batch?.facts?.[index - 1];
    const relatedNodes = coerceStringArray(item.relatedNodes);
    const interpretation = String(item.interpretation ?? "").trim();
    const source = batch?.sources?.[entry?.[3]];
    if (!entry || !source?.[1] || !nodeById.has(entry[0]) || !interpretation ||
        relatedNodes.some((id) => !nodeById.has(id)) || !relatedNodes.includes(entry[0])) {
      warnings.push(`Skipped fact note with missing fact, source, subject, related node or interpretation: ${ref}`);
      continue;
    }
    factNotes.push({
      ref,
      entityId: entry[0],
      category: entry[2],
      relatedNodes,
      interpretation,
      sourceUrl: source?.[1],
      sourceFingerprint: createHash("sha256")
        .update(`${batchId}\n${entry[0]}\n${entry[1]}`)
        .digest("hex"),
    });
  }

  return {
    payload,
    feedback,
    factNotes,
    warnings,
  };
}

function approvedFactEvidence(graph) {
  const warnings = [];
  const byEntity = new Map();
  const byFingerprint = new Map();
  const knownIds = new Set((graph.nodes ?? []).map((node) => node.id));
  let curatedCount = 0;
  for (const fact of JSON.parse(fs.readFileSync(curatedFactsPath, "utf8"))) {
    if (!knownIds.has(fact.entityId) || !fact.sources?.length) {
      warnings.push(`Skipped curated fact for unknown or invalid node: ${fact.entityId}`);
      continue;
    }
    byEntity.set(fact.entityId, (byEntity.get(fact.entityId) ?? 0) + 1);
    curatedCount += 1;
  }
  if (!fs.existsSync(approvedFactEvidencePath)) {
    warnings.push("Approved fact snapshot missing; run brain:facts:sync-approved.");
    return { syncedAt: undefined, curatedCount, byEntity, byFingerprint, warnings };
  }

  const snapshot = JSON.parse(fs.readFileSync(approvedFactEvidencePath, "utf8"));
  if (snapshot.version !== 1 || !Array.isArray(snapshot.facts)) {
    throw new Error("Invalid approved fact evidence snapshot.");
  }
  for (const fact of snapshot.facts) {
    if (!knownIds.has(fact.entityId) || !fact.sourceFingerprint || !fact.sources?.length) {
      warnings.push(`Skipped approved fact evidence for unknown or invalid node: ${fact.entityId}`);
      continue;
    }
    const key = `${fact.entityId}:${fact.sourceFingerprint}`;
    if (byFingerprint.has(key)) {
      warnings.push(`Skipped duplicate approved fact fingerprint for ${fact.entityId}`);
      continue;
    }
    byFingerprint.set(key, fact);
    byEntity.set(fact.entityId, (byEntity.get(fact.entityId) ?? 0) + 1);
  }
  return { syncedAt: snapshot.syncedAt, curatedCount, byEntity, byFingerprint, warnings };
}

function graphMaps(graph) {
  const nodes = graph.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  const genreLinks = new Map(nodes.map((node) => [node.id, new Set()]));
  const zonesByNode = new Map(nodes.map((node) => [node.id, new Set([node.zone].filter(Boolean))]));

  for (const edge of graph.edges ?? []) {
    if (!isMapConnection(edge)) continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;

    degree.set(source.id, (degree.get(source.id) ?? 0) + 1);
    degree.set(target.id, (degree.get(target.id) ?? 0) + 1);
    if (source.zone && target.zone && source.zone !== target.zone) {
      zonesByNode.get(source.id)?.add(target.zone);
      zonesByNode.get(target.id)?.add(source.zone);
    }

    if (source.type === "genre" && target.type !== "genre") {
      genreLinks.get(target.id)?.add(source.id);
      zonesByNode.get(target.id)?.add(source.zone);
    }
    if (target.type === "genre" && source.type !== "genre") {
      genreLinks.get(source.id)?.add(target.id);
      zonesByNode.get(source.id)?.add(target.zone);
    }
  }

  return { nodeById, degree, genreLinks, zonesByNode };
}

function termSeeds(node, note, linkedGenres) {
  const values = [
    node.id,
    node.label,
    node.type,
    ...(node.roles ?? []),
    ...(node.metadata ?? []),
    ...(node.aliases ?? []),
    ...(note?.aliases ?? []),
    ...(note?.primaryGenres ?? []),
    ...(note?.curatorTags ?? []),
    ...linkedGenres,
  ];
  const terms = new Set();

  for (const value of values) {
    const normalized = normalize(value);
    if (!normalized) continue;
    terms.add(normalized);
    const words = normalized.split(" ").filter((word) => word.length > 2 && !STOP_WORDS.has(word));
    words.forEach((word) => terms.add(word));
  }

  return [...terms];
}

function buildLearningModel(graph, notes, feedbackData, approvedEvidence, warnings) {
  const { nodeById, degree, genreLinks, zonesByNode } = graphMaps(graph);
  const zoneTerms = new Map();
  const zoneStats = new Map();
  const learnedNodes = {};
  const feedback = feedbackData.feedback;
  const interpretedFactNotes = feedbackData.factNotes.map((note) => {
    const approved = approvedEvidence.byFingerprint.get(`${note.entityId}:${note.sourceFingerprint}`);
    return {
      ...note,
      approvalAtLastSync: approved ? "approved" : "not-in-approved-snapshot",
      ...(approved?.verifiedAt ? { verifiedAt: approved.verifiedAt } : {}),
    };
  });
  const factNotesByEntity = Map.groupBy(interpretedFactNotes, (item) => item.entityId);

  for (const zone of new Set((graph.nodes ?? []).map((node) => node.zone).filter(Boolean))) {
    zoneTerms.set(zone, new Map());
    zoneStats.set(zone, {
      nodeCount: 0,
      pinnedCount: 0,
      xValues: [],
      yValues: [],
      eras: [],
    });
  }

  for (const node of graph.nodes ?? []) {
    const note = notes.get(node.id);
    const noteFeedback = feedback.get(node.id);
    const linkedGenreIds = [...(genreLinks.get(node.id) ?? [])];
    const linkedGenreLabels = linkedGenreIds.map((id) => nodeById.get(id)?.label ?? id);
    const primaryZone = noteFeedback?.zone || note?.zone || node.zone;
    const secondaryZones = [
      ...(noteFeedback?.secondaryZones ?? []),
      ...(note?.secondaryZones ?? []),
      ...[...(zonesByNode.get(node.id) ?? [])].filter((zone) => zone && zone !== primaryZone),
    ];
    const uniqueSecondaryZones = [...new Set(secondaryZones)].filter(Boolean);
    const nodeDegree = degree.get(node.id) ?? 0;
    const bridgeScore = clamp01(uniqueSecondaryZones.length * 0.22 + linkedGenreIds.length * 0.08 + (noteFeedback?.bridgeBoost ?? 0));
    const hubScore = clamp01(nodeDegree / 12 + (noteFeedback?.hubBoost ?? 0));
    const years = [
      noteFeedback?.eraStart,
      noteFeedback?.eraPeak,
      note?.eraStart,
      note?.eraPeak,
      ...(node.metadata ?? []).flatMap(yearsFromText),
      ...yearsFromText(node.summary),
    ].filter(Number.isFinite);
    const eraStart = noteFeedback?.eraStart ?? note?.eraStart ?? (years.length ? Math.min(...years) : undefined);
    const eraPeak = noteFeedback?.eraPeak ?? note?.eraPeak ?? median(years);
    const pinned = Boolean(noteFeedback?.layoutPinned ?? note?.layoutPinned);
    const x = pinned ? (noteFeedback?.layoutX ?? note?.layoutX) : undefined;
    const y = pinned ? (noteFeedback?.layoutY ?? note?.layoutY) : undefined;
    const primaryGenres = mergeUnique(noteFeedback?.primaryGenres, note?.primaryGenres);
    const curatorTags = mergeUnique(noteFeedback?.curatorTags, note?.curatorTags);

    if (!zoneTerms.has(primaryZone)) zoneTerms.set(primaryZone, new Map());
    if (!zoneStats.has(primaryZone)) {
      zoneStats.set(primaryZone, { nodeCount: 0, pinnedCount: 0, xValues: [], yValues: [], eras: [] });
    }

    const stats = zoneStats.get(primaryZone);
    stats.nodeCount += 1;
    if (pinned) stats.pinnedCount += 1;
    if (Number.isFinite(node.x)) stats.xValues.push(node.x);
    if (Number.isFinite(node.y)) stats.yValues.push(node.y);
    if (Number.isFinite(eraStart)) stats.eras.push(eraStart);

    const terms = termSeeds(node, note, linkedGenreLabels);
    for (const term of terms) {
      const amount = (primaryZone !== node.zone ? 3 : 1) + (primaryGenres.length ? 1 : 0);
      addWeighted(zoneTerms.get(primaryZone), term, amount);
    }
    for (const term of [...primaryGenres, ...curatorTags, noteFeedback?.feedback].filter(Boolean)) {
      addWeighted(zoneTerms.get(primaryZone), term, 4);
    }

    learnedNodes[node.id] = {
      zone: primaryZone,
      secondaryZones: uniqueSecondaryZones,
      eraStart,
      eraPeak,
      primaryGenres,
      curatorTags,
      curatorFeedback: noteFeedback?.feedback,
      ...(factNotesByEntity.has(node.id) ? { factNotes: factNotesByEntity.get(node.id) } : {}),
      ...(approvedEvidence.byEntity.has(node.id)
        ? { approvedFactCount: approvedEvidence.byEntity.get(node.id) }
        : {}),
      connectionCount: nodeDegree,
      linkedGenres: linkedGenreIds,
      bridgeScore: Number(bridgeScore.toFixed(3)),
      hubScore: Number(hubScore.toFixed(3)),
      layoutHints: {
        pinned,
        x,
        y,
      },
    };
  }

  for (const item of feedbackData.payload.zoneFeedback ?? []) {
    const zone = String(item.zone ?? "").trim();
    if (!zone) continue;
    if (!zoneTerms.has(zone)) zoneTerms.set(zone, new Map());
    for (const term of coerceStringArray(item.terms)) {
      addWeighted(zoneTerms.get(zone), term, 8);
    }
    for (const term of coerceStringArray(item.bridgeToZones)) {
      addWeighted(zoneTerms.get(zone), term, 3);
    }
    if (item.feedback) {
      addWeighted(zoneTerms.get(zone), item.feedback, 3);
    }
  }

  for (const policy of feedbackData.payload.bridgePolicies ?? []) {
    const zones = coerceStringArray(policy.zones);
    const anchorNodes = coerceStringArray(policy.anchorNodes);
    const categories = coerceStringArray(policy.feedbackCategories);
    for (const zone of zones) {
      if (!zone) continue;
      if (!zoneTerms.has(zone)) zoneTerms.set(zone, new Map());
      for (const connectedZone of zones.filter((candidate) => candidate !== zone)) {
        addWeighted(zoneTerms.get(zone), connectedZone, 4);
      }
      for (const anchor of anchorNodes) {
        addWeighted(zoneTerms.get(zone), anchor, 6);
      }
      for (const category of categories) {
        addWeighted(zoneTerms.get(zone), category, 3);
      }
      if (policy.feedback) {
        addWeighted(zoneTerms.get(zone), policy.feedback, 3);
      }
    }
  }

  const zones = {};
  for (const [zone, terms] of zoneTerms) {
    const stats = zoneStats.get(zone) ?? { nodeCount: 0, pinnedCount: 0, xValues: [], yValues: [], eras: [] };
    zones[zone] = {
      nodeCount: stats.nodeCount,
      pinnedCount: stats.pinnedCount,
      centroid: {
        x: median(stats.xValues),
        y: median(stats.yValues),
      },
      eraMedian: median(stats.eras),
      learnedTerms: [...terms.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))
        .slice(0, 80)
        .map(([term, weight]) => ({ term, weight: Number(weight.toFixed(3)) })),
    };
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "graph + Obsidian frontmatter + curator feedback",
    samples: {
      graphNodes: graph.nodes?.length ?? 0,
      graphEdges: graph.edges?.length ?? 0,
      mapConnections: (graph.edges ?? []).filter(isMapConnection).length,
      obsidianNotes: notes.size,
      feedbackNodes: feedback.size,
      feedbackZones: feedbackData.payload.zoneFeedback?.length ?? 0,
      feedbackRules: feedbackData.payload.rules?.length ?? 0,
      feedbackCategories: feedbackData.payload.feedbackCategories?.length ?? 0,
      bridgePolicies: feedbackData.payload.bridgePolicies?.length ?? 0,
      factNotes: feedbackData.factNotes.length,
      approvedFacts: approvedEvidence.byFingerprint.size + approvedEvidence.curatedCount,
      approvedSupabaseFacts: approvedEvidence.byFingerprint.size,
      curatedFacts: approvedEvidence.curatedCount,
      approvedFactNodes: approvedEvidence.byEntity.size,
      approvedFactNotes: interpretedFactNotes.filter((note) => note.approvalAtLastSync === "approved").length,
      pinnedNotes: [...notes.values()].filter((note) => note.layoutPinned).length,
      notesWithEra: [...notes.values()].filter((note) => note.eraStart || note.eraPeak).length,
      notesWithPrimaryGenres: [...notes.values()].filter((note) => note.primaryGenres.length).length,
      notesWithCuratorTags: [...notes.values()].filter((note) => note.curatorTags.length).length,
    },
    zones,
    nodes: learnedNodes,
    curatorFeedback: {
      updatedAt: feedbackData.payload.updatedAt,
      rules: feedbackData.payload.rules ?? [],
      feedbackCategories: feedbackData.payload.feedbackCategories ?? [],
      bridgePolicies: feedbackData.payload.bridgePolicies ?? [],
      factNotes: interpretedFactNotes,
      nodeIds: [...feedback.keys()].sort((a, b) => a.localeCompare(b, "en")),
    },
    approvedFactEvidence: {
      syncedAt: approvedEvidence.syncedAt,
      supabaseFacts: approvedEvidence.byFingerprint.size,
      curatedFacts: approvedEvidence.curatedCount,
      factsTotal: approvedEvidence.byFingerprint.size + approvedEvidence.curatedCount,
      nodesCovered: approvedEvidence.byEntity.size,
    },
    warnings,
  };
}

function writeReport(model) {
  const lines = [
    "# MHM Learning Report",
    "",
    `Generated: ${model.generatedAt}`,
    "",
    "## Samples",
    "",
    `- Graph nodes: ${model.samples.graphNodes}`,
    `- Graph edges: ${model.samples.graphEdges}`,
    `- Obsidian notes: ${model.samples.obsidianNotes}`,
    `- Feedback nodes: ${model.samples.feedbackNodes}`,
    `- Feedback zones: ${model.samples.feedbackZones}`,
    `- Feedback rules: ${model.samples.feedbackRules}`,
    `- Feedback categories: ${model.samples.feedbackCategories}`,
    `- Bridge policies: ${model.samples.bridgePolicies}`,
    `- Fact interpretation notes: ${model.samples.factNotes}`,
    `- Approved facts at last sync: ${model.samples.approvedFacts}`,
    `- Supabase-approved facts: ${model.samples.approvedSupabaseFacts}`,
    `- Repository-curated facts: ${model.samples.curatedFacts}`,
    `- Nodes with approved facts: ${model.samples.approvedFactNodes}`,
    `- Approved fact interpretations: ${model.samples.approvedFactNotes}`,
    `- Fact snapshot synced: ${model.approvedFactEvidence.syncedAt ?? "not available"}`,
    `- Pinned notes: ${model.samples.pinnedNotes}`,
    `- Notes with era data: ${model.samples.notesWithEra}`,
    `- Notes with primary genres: ${model.samples.notesWithPrimaryGenres}`,
    `- Notes with curator tags: ${model.samples.notesWithCuratorTags}`,
    "",
    "## Zones",
    "",
  ];

  for (const [zone, data] of Object.entries(model.zones).sort((a, b) => a[0].localeCompare(b[0], "en"))) {
    const terms = data.learnedTerms.slice(0, 12).map((item) => item.term).join(", ");
    lines.push(`### ${zone}`, "");
    lines.push(`- Nodes: ${data.nodeCount}`);
    lines.push(`- Pinned: ${data.pinnedCount}`);
    lines.push(`- Era median: ${data.eraMedian ?? "unknown"}`);
    lines.push(`- Strongest learned terms: ${terms || "none"}`);
    lines.push("");
  }

  if (model.curatorFeedback.nodeIds.length || model.curatorFeedback.rules.length) {
    lines.push("## Curator Feedback", "");
    lines.push(`- Feedback file updated: ${model.curatorFeedback.updatedAt ?? "unknown"}`);
    lines.push(`- Node feedback: ${model.curatorFeedback.nodeIds.length ? model.curatorFeedback.nodeIds.join(", ") : "none"}`);
    lines.push(`- Rules: ${model.curatorFeedback.rules.length ? model.curatorFeedback.rules.map((rule) => rule.id).join(", ") : "none"}`);
    lines.push(`- Categories: ${model.curatorFeedback.feedbackCategories?.length ? model.curatorFeedback.feedbackCategories.map((category) => category.id).join(", ") : "none"}`);
    lines.push(`- Bridge policies: ${model.curatorFeedback.bridgePolicies?.length ? model.curatorFeedback.bridgePolicies.map((policy) => policy.id).join(", ") : "none"}`);
    lines.push("");
  }

  if (model.warnings.length) {
    lines.push("## Warnings", "");
    model.warnings.forEach((warning) => lines.push(`- ${warning}`));
    lines.push("");
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const { notes, warnings } = frontmatterById();
const feedbackData = feedbackById(graph);
const approvedEvidence = approvedFactEvidence(graph);
const model = buildLearningModel(graph, notes, feedbackData, approvedEvidence,
  [...warnings, ...feedbackData.warnings, ...approvedEvidence.warnings]);

fs.writeFileSync(modelPath, `${JSON.stringify(model, null, 2)}\n`);
writeReport(model);

console.log(JSON.stringify({
  modelPath,
  reportPath,
  samples: model.samples,
  zones: Object.fromEntries(Object.entries(model.zones).map(([zone, data]) => [zone, data.nodeCount])),
  warnings,
}, null, 2));
