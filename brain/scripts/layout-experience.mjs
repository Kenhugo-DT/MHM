import { createHash } from "node:crypto";

export const EMPTY_LAYOUT_EXPERIENCE = { version: 1, batches: [] };

export function layoutParameterKey(parameters) {
  return [parameters.spacing, parameters.connectionPull, parameters.zoneFreedom, parameters.iterations]
    .map((value) => Number(value).toFixed(2)).join(":");
}

export function historicalLayoutPreference(experience, mode, zone, parameters, hinted = false) {
  const key = layoutParameterKey(parameters);
  const trials = (experience?.batches ?? []).flatMap((batch) => batch.trials ?? [])
    .filter((trial) => trial.mode === mode && trial.zone === zone && trial.parameters === key &&
      Boolean(trial.hintCount) === hinted);
  const safe = trials.filter((trial) => trial.reason === "safe").length;
  return { samples: trials.length, safe, rate: (safe + 1) / (trials.length + 2) };
}

export function appendLayoutExperience(experience, graph, previous, report) {
  if (experience?.version !== 1 || !Array.isArray(experience.batches)) {
    throw new Error("Layout experience has an unsupported format.");
  }
  if (graph.nodes.some((node) => node.synthetic || node.id.startsWith("__simulation_"))) {
    throw new Error("Synthetic nodes cannot train approved layout experience.");
  }
  const oldNodes = previous?.layouts?.organized?.nodes;
  if (!oldNodes || !report?.freshNodes) return experience;
  const freshIds = graph.nodes.filter((node) => !oldNodes[node.id]).map((node) => node.id).sort();
  if (freshIds.length !== report.freshNodes) throw new Error("Fresh-node count changed during layout repair.");
  const batchId = createHash("sha256").update(JSON.stringify(freshIds)).digest("hex").slice(0, 20);
  if (experience.batches.some((batch) => batch.id === batchId)) return experience;
  const trials = report.trials.flatMap((trial) => (trial.candidates ?? []).map((candidate) => ({
    mode: trial.mode, zone: trial.zone, parameters: layoutParameterKey(candidate.parameters),
    arm: candidate.arm ?? "plain",
    hintCount: candidate.arm === "plain" ? 0 : trial.hintIds?.length ?? 0,
    hintIds: candidate.arm === "plain" ? [] : trial.hintIds ?? [],
    reason: candidate.reason, selected: report.accepted.some((accepted) =>
      accepted.mode === trial.mode && accepted.zone === trial.zone &&
      (accepted.arm ?? "plain") === (candidate.arm ?? "plain") &&
      layoutParameterKey(accepted.parameters) === layoutParameterKey(candidate.parameters)),
    severeNewLabels: candidate.focusAfter.severelyOverlappingNodes,
    newLabelPairs: candidate.focusAfter.overlapPairs,
    meanNewConnection: candidate.connectionsAfter.mean,
    pairExcessBefore: candidate.constraintsBefore?.totalExcess ?? 0,
    pairExcessAfter: candidate.constraintsAfter?.totalExcess ?? 0,
  })));
  return { version: 1, batches: [...experience.batches, {
    id: batchId, graphGeneratedAt: graph.generatedAt, freshNodes: freshIds.length, trials,
  }].slice(-100) };
}
