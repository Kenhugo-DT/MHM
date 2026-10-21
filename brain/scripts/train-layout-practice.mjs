import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMapConnection } from "../../shared/graph-schema/edge-evidence.mjs";
import { evaluateLayout, evaluateNodeLegibility, evaluateFocusedConnections } from "../../shared/layout-playground/experiment.mjs";
import { validateLayoutConstraints, evaluateLayoutConstraints } from "../../shared/layout-playground/constraints.mjs";
import { ORGANIZED_MAP_ZONES } from "./organize-graph-layout.mjs";
import { preserveIncrementalLayouts } from "./incremental-layout.mjs";
import { repairIncrementalLayouts } from "./adaptive-incremental-layout.mjs";
import { appendLayoutExperience, EMPTY_LAYOUT_EXPERIENCE, layoutParameterKey } from "./layout-experience.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODES = ["organized", "genre", "chaos"];
const ZONES = Object.entries(ORGANIZED_MAP_ZONES).map(([id, zone]) => ({ id, ...zone }));
const TRAIN_PER_ZONE = 4;
const VALIDATION_PER_ZONE = 2;
const TEST_PER_ZONE = 2;
const SEARCH_PARAMETERS = [
  { spacing: 1.2, connectionPull: 0.3, zoneFreedom: 0.5, iterations: 32 },
  { spacing: 1.3, connectionPull: 0.2, zoneFreedom: 0.6, iterations: 36 },
  { spacing: 1.5, connectionPull: 0.25, zoneFreedom: 0.7, iterations: 40 },
  { spacing: 1.6, connectionPull: 0.35, zoneFreedom: 0.55, iterations: 36 },
  { spacing: 1.75, connectionPull: 0.2, zoneFreedom: 0.8, iterations: 40 },
  { spacing: 1.9, connectionPull: 0.1, zoneFreedom: 0.9, iterations: 44 },
];

function stableOrder(id) {
  return createHash("sha256").update(`layout-practice-v1:${id}`).digest("hex");
}

export function selectPracticeNodes(graph, layouts, maxZones = 12) {
  const sourcedDegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    if (!isMapConnection(edge) || !edge.sources?.some((source) => source.url)) continue;
    for (const id of [edge.source, edge.target]) {
      if (sourcedDegree.has(id)) sourcedDegree.set(id, sourcedDegree.get(id) + 1);
    }
  }
  const candidates = graph.nodes.filter((node) => sourcedDegree.get(node.id) > 0 &&
    MODES.every((mode) => layouts.layouts[mode]?.nodes[node.id]));
  const byZone = Map.groupBy(candidates, (node) => node.zone);
  const selectedZones = [...byZone].filter(([, nodes]) =>
    nodes.length >= TRAIN_PER_ZONE + VALIDATION_PER_ZONE + TEST_PER_ZONE)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, maxZones);
  return selectedZones.flatMap(([zone, nodes]) => {
    const ordered = [...nodes].sort((a, b) => stableOrder(a.id).localeCompare(stableOrder(b.id)));
    return ordered.slice(0, TRAIN_PER_ZONE + VALIDATION_PER_ZONE + TEST_PER_ZONE).map((node, index) => ({
      id: node.id, zone, split: index < TRAIN_PER_ZONE ? "train" :
        index < TRAIN_PER_ZONE + VALIDATION_PER_ZONE ? "validation" : "test",
    }));
  });
}

export function replayNode(graph, layouts, guidance, feedback, constraints, id, practice,
  additionalParameters = []) {
  const node = graph.nodes.find((item) => item.id === id);
  const previous = structuredClone(layouts);
  const current = structuredClone(layouts.layouts);
  const zone = ORGANIZED_MAP_ZONES[node.zone];
  for (const mode of MODES) {
    delete previous.layouts[mode].nodes[id];
    current[mode].nodes[id] = { ...current[mode].nodes[id],
      x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
  }
  preserveIncrementalLayouts(current, previous, graph);
  const baseline = Object.fromEntries(MODES.map((mode) => [mode, structuredClone(current[mode].nodes)]));
  const report = repairIncrementalLayouts(current, previous, graph, guidance, ZONES, feedback,
    new Set(), { captureTrials: true, constraints, practice, additionalParameters });
  const focus = new Set([id]);
  const measurements = Object.fromEntries(MODES.map((mode) => {
    const before = baseline[mode];
    const after = current[mode].nodes;
    const active = constraints.filter((item) => item.source === id || item.target === id);
    return [mode, {
      before: evaluateLayout(graph, before, before),
      after: evaluateLayout(graph, before, after),
      labels: evaluateNodeLegibility(graph, after, focus),
      connections: evaluateFocusedConnections(graph, after, focus),
      pairExcess: evaluateLayoutConstraints(after, active).totalExcess,
      selection: report.trials.find((trial) => trial.mode === mode)?.selection ?? "none",
      chosen: layoutParameterKey(report.accepted.find((item) => item.mode === mode)?.parameters ??
        { spacing: 0, connectionPull: 0, zoneFreedom: 0, iterations: 0 }),
    }];
  }));
  return { previous, report, measurements };
}

function compareHoldout(baseline, trained) {
  const regressions = [];
  const improvements = [];
  for (const mode of MODES) {
    const a = baseline[mode];
    const b = trained[mode];
    if (b.labels.severelyOverlappingNodes > a.labels.severelyOverlappingNodes ||
        b.labels.overlapPairs > a.labels.overlapPairs ||
        b.after.severeOverlaps > a.after.severeOverlaps ||
        b.after.overlaps > a.after.overlaps ||
        b.connections.mean > a.connections.mean + 100 ||
        b.connections.longestSameZone > a.connections.longestSameZone + 150 ||
        b.connections.longestCrossZone > a.connections.longestCrossZone + 150) regressions.push(mode);
    if (b.labels.overlapPairs < a.labels.overlapPairs ||
        b.after.overlaps < a.after.overlaps ||
        b.pairExcess < a.pairExcess ||
        b.connections.mean < a.connections.mean ||
        b.after.score < a.after.score) improvements.push(mode);
  }
  return { regressions, improvements };
}

function chooseLearnedParameters(samples) {
  const cells = new Map();
  for (const { item, baseline, searched } of samples) {
    for (const mode of MODES) {
      const trial = searched.report.trials.find((entry) => entry.mode === mode && entry.zone === item.zone);
      if (!trial) continue;
      const key = `${mode}|${item.zone}`;
      if (!cells.has(key)) cells.set(key, new Map());
      const byParameter = new Map();
      for (const candidate of trial.candidates) {
        if (!SEARCH_PARAMETERS.some((parameters) =>
          layoutParameterKey(parameters) === layoutParameterKey(candidate.parameters))) continue;
        const parameterKey = layoutParameterKey(candidate.parameters);
        const previous = byParameter.get(parameterKey);
        if (!previous || candidate.reason === "safe" && previous.reason !== "safe" ||
            candidate.reason === previous.reason &&
              candidate.wholeMapAfter.severeOverlaps < previous.wholeMapAfter.severeOverlaps) {
          byParameter.set(parameterKey, candidate);
        }
      }
      for (const candidate of byParameter.values()) {
        const choice = cells.get(key);
        const parameterKey = layoutParameterKey(candidate.parameters);
        if (!choice.has(parameterKey)) choice.set(parameterKey, {
          parameters: candidate.parameters, safe: 0, wins: 0, regressions: 0,
        });
        const record = choice.get(parameterKey);
        if (candidate.reason !== "safe") continue;
        record.safe += 1;
        const original = baseline.measurements[mode];
        if (candidate.focusAfter.overlapPairs > original.labels.overlapPairs ||
            candidate.focusAfter.severelyOverlappingNodes > original.labels.severelyOverlappingNodes ||
            candidate.wholeMapAfter.severeOverlaps > original.after.severeOverlaps ||
            candidate.wholeMapAfter.overlaps > original.after.overlaps ||
            candidate.connectionsAfter.mean > original.connections.mean + 100) record.regressions += 1;
        else if (candidate.focusAfter.overlapPairs < original.labels.overlapPairs ||
            candidate.wholeMapAfter.severeOverlaps < original.after.severeOverlaps ||
            candidate.wholeMapAfter.overlaps < original.after.overlaps ||
            candidate.connectionsAfter.mean < original.connections.mean) record.wins += 1;
      }
    }
  }
  const parametersByModeZone = {};
  const candidates = [];
  for (const [key, choices] of cells) {
    const [mode, zone] = key.split("|");
    const eligible = [...choices.values()].filter((choice) =>
      choice.safe >= Math.max(2, samples.filter((sample) => sample.item.zone === zone).length - 1) &&
      choice.wins >= 2 && choice.regressions === 0)
      .sort((a, b) => b.wins - a.wins || b.safe - a.safe ||
        layoutParameterKey(a.parameters).localeCompare(layoutParameterKey(b.parameters)));
    if (!eligible.length) continue;
    parametersByModeZone[mode] ??= {};
    parametersByModeZone[mode][zone] = [eligible[0].parameters];
    candidates.push({ mode, zone, ...eligible[0] });
  }
  return { parametersByModeZone, candidates };
}

function validatePractice(graph, layouts, guidance, feedback, constraints, holdout, practice) {
  return holdout.map((item) => {
    const baseline = replayNode(graph, layouts, guidance, feedback, constraints, item.id);
    const trained = replayNode(graph, layouts, guidance, feedback, constraints, item.id, practice);
    return { ...item, baseline: baseline.measurements, trained: trained.measurements,
      ...compareHoldout(baseline.measurements, trained.measurements) };
  });
}

function summarizeTrials(experience) {
  const records = new Map();
  for (const batch of experience.batches) {
    for (const trial of batch.trials) {
      const key = [trial.mode, trial.zone, trial.parameters, trial.hintCount ?? 0].join("|");
      if (!records.has(key)) records.set(key, { mode: trial.mode, zone: trial.zone,
        parameters: trial.parameters, hintCount: trial.hintCount ?? 0, samples: 0, safe: 0 });
      const record = records.get(key);
      record.samples += 1;
      if (trial.reason === "safe") record.safe += 1;
    }
  }
  return [...records.values()].sort((a, b) =>
    a.mode.localeCompare(b.mode) || a.zone.localeCompare(b.zone) ||
    a.parameters.localeCompare(b.parameters) || a.hintCount - b.hintCount);
}

export function choosePracticeRelease(challenger, incumbent, incumbentTest = []) {
  if (challenger.enabled || !incumbent?.enabled) return { practice: challenger, release: "new-practice" };
  const regressions = incumbentTest.flatMap((item) => item.regressions);
  const improvements = incumbentTest.flatMap((item) => item.improvements);
  const changed = incumbentTest.some((item) => MODES.some((mode) =>
    item.baseline[mode]?.chosen !== item.trained[mode]?.chosen));
  return !regressions.length && improvements.length && changed
    ? { practice: incumbent, release: "retained-previous-practice" }
    : { practice: challenger, release: "new-practice" };
}

export function trainLayoutPractice(graph, layouts, guidance, feedback, constraints,
  selection = selectPracticeNodes(graph, layouts), incumbent) {
  let experience = EMPTY_LAYOUT_EXPERIENCE;
  const training = selection.filter((item) => item.split === "train");
  const validationNodes = selection.filter((item) => item.split === "validation");
  const testNodes = selection.filter((item) => item.split === "test");
  if (!training.length || !validationNodes.length || !testNodes.length ||
      new Set(selection.map((item) => item.id)).size !== selection.length ||
      training.length + validationNodes.length + testNodes.length !== selection.length) {
    throw new Error("Layout practice requires disjoint training, validation and test nodes.");
  }
  const samples = training.map((item) => ({ item,
    baseline: replayNode(graph, layouts, guidance, feedback, constraints, item.id),
    searched: replayNode(graph, layouts, guidance, feedback, constraints, item.id,
      undefined, SEARCH_PARAMETERS),
  }));
  for (const { searched } of samples) {
    experience = appendLayoutExperience(experience, graph, searched.previous, searched.report);
  }
  const learned = chooseLearnedParameters(samples);
  const practice = { version: 1, enabled: true, source: "approved-node-replay",
    parametersByModeZone: learned.parametersByModeZone, summary: summarizeTrials(experience) };
  const firstValidation = validatePractice(graph, layouts, guidance, feedback, constraints,
    validationNodes, practice);
  for (const [mode, zones] of Object.entries(practice.parametersByModeZone)) {
    for (const zone of Object.keys(zones)) {
      const views = firstValidation.filter((item) => item.zone === zone);
      const changed = views.some((item) => item.baseline[mode].chosen !== item.trained[mode].chosen);
      const improved = views.some((item) => item.improvements.includes(mode));
      const regressed = views.some((item) => item.regressions.includes(mode));
      if (!changed || !improved || regressed) delete zones[zone];
    }
  }
  const validation = validatePractice(graph, layouts, guidance, feedback, constraints,
    validationNodes, practice);
  const finalTest = validatePractice(graph, layouts, guidance, feedback, constraints,
    testNodes, practice);
  const changedViews = finalTest.flatMap((item) => MODES.map((mode) =>
    item.baseline[mode].chosen !== item.trained[mode].chosen ? `${item.id}/${mode}` : null))
    .filter(Boolean);
  const regressionViews = finalTest.flatMap((item) => item.regressions.map((mode) => `${item.id}/${mode}`));
  const improvedViews = finalTest.flatMap((item) => item.improvements.map((mode) => `${item.id}/${mode}`));
  practice.enabled = changedViews.length > 0 && regressionViews.length === 0 && improvedViews.length > 0;
  practice.trainedNodes = training.map((item) => item.id);
  practice.validationNodes = validationNodes.map((item) => item.id);
  practice.testNodes = testNodes.map((item) => item.id);
  practice.trainedGraphNodes = graph.nodes.length;
  let incumbentTest;
  if (!practice.enabled && incumbent?.enabled) {
    incumbentTest = validatePractice(graph, layouts, guidance, feedback, constraints,
      testNodes, incumbent);
  }
  const { practice: selected, release } = choosePracticeRelease(practice, incumbent, incumbentTest);
  return { practice: selected, report: { version: 1, sandboxOnly: true,
    trainingNodes: training, validationNodes, testNodes, learnedCandidates: learned.candidates,
    changedViews, regressionViews, improvedViews,
    enabled: selected.enabled, release, validation, finalTest,
    ...(incumbentTest ? { incumbentTest } : {}) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const approved = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "approved", name), "utf8"));
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const constraints = validateLayoutConstraints(approved("layout-constraints.json"), graph);
  const output = path.join(ROOT, "data", "approved", "layout-practice.json");
  const incumbent = fs.existsSync(output) ? approved("layout-practice.json") : undefined;
  const result = trainLayoutPractice(graph, layouts,
    approved("organization-model.json").layoutIntelligence,
    approved("layout-feedback.json").reviews, constraints, undefined, incumbent);
  const report = path.join(ROOT, "data", "runs", "layout-practice-report.json");
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result.practice, null, 2)}\n`);
  fs.writeFileSync(report, `${JSON.stringify(result.report, null, 2)}\n`);
  console.log(`Practiced on ${result.report.trainingNodes.length} approved nodes; ` +
    `tuned on ${result.report.validationNodes.length}; independently tested ` +
    `${result.report.testNodes.length} separate nodes. ` +
    `Changed ${result.report.changedViews.length} views; improved ${result.report.improvedViews.length}; ` +
    `regressed ${result.report.regressionViews.length}. ` +
    `Release: ${result.report.release}; policy enabled: ${result.practice.enabled}.`);
}
