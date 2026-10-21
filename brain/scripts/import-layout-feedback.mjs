import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { classifyOutcome, evaluateLayout } from "../../shared/layout-playground/experiment.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPROVED = path.join(ROOT, "data", "approved");
const MODES = new Set(["organized", "genre", "chaos"]);

function sameMetrics(actual, claimed) {
  return actual && claimed && Object.entries(actual).every(([key, value]) => value === claimed[key]);
}

export function validateLayoutReport(report, graph, layouts) {
  if (report?.version !== 1 || report.graphGeneratedAt !== graph.generatedAt ||
      report.layoutGeneratedAt !== layouts.generatedAt) {
    throw new Error("Layout feedback is stale or has an unsupported format.");
  }
  const { mode, zone, current } = report;
  if (!MODES.has(mode) || !graph.nodes.some((node) => node.zone === zone)) {
    throw new Error("Unknown layout mode or zone.");
  }
  const review = current?.review;
  if (!review || !["better", "worse"].includes(review.verdict) ||
      review.mode !== mode || review.zone !== zone) {
    throw new Error("Mark the current experiment Better or Worse before exporting.");
  }
  const parameters = current.parameters;
  if (!parameters || !["spacing", "connectionPull", "zoneFreedom", "iterations"].every((key) =>
    Number.isFinite(parameters[key])) || parameters.spacing < 0.5 || parameters.spacing > 2 ||
    parameters.connectionPull < 0 || parameters.connectionPull > 1 ||
    parameters.zoneFreedom < 0 || parameters.zoneFreedom > 1 ||
    parameters.iterations < 1 || parameters.iterations > 100 ||
    JSON.stringify(parameters) !== JSON.stringify(review.parameters)) {
    throw new Error("Experiment parameters do not match the review.");
  }
  const baseline = layouts.layouts[mode]?.nodes;
  const positions = current.positions;
  if (!baseline || !positions || Object.keys(positions).length !== graph.nodes.length ||
      graph.nodes.some((node) => !baseline[node.id] || !Number.isFinite(positions[node.id]?.x) ||
        !Number.isFinite(positions[node.id]?.y))) {
    throw new Error("Experiment positions do not match the approved graph.");
  }
  const before = evaluateLayout(graph, baseline, baseline, zone);
  const after = evaluateLayout(graph, baseline, positions, zone);
  if (!sameMetrics(before, current.before) || !sameMetrics(after, current.after) ||
      !sameMetrics(before, review.before) || !sameMetrics(after, review.after) ||
      classifyOutcome(before, after) !== current.outcome) {
    throw new Error("Experiment metrics cannot be reproduced from the approved layout.");
  }
  if (review.verdict === "better" && current.outcome !== "improved") {
    throw new Error("A Better review must pass the layout quality gate.");
  }
  const note = String(review.note ?? "").trim().slice(0, 500);
  const id = createHash("sha256").update(JSON.stringify({ graph: graph.generatedAt, layout: layouts.generatedAt,
    mode, zone, parameters, verdict: review.verdict, score: after.score, note })).digest("hex").slice(0, 20);
  return { id, mode, zone, verdict: review.verdict, parameters, note,
    graphGeneratedAt: graph.generatedAt, layoutGeneratedAt: layouts.generatedAt,
    before, after, importedAt: new Date().toISOString() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: npm run brain:layout-feedback:import -- <exported-report.json>");
  const report = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
  const graph = JSON.parse(fs.readFileSync(path.join(APPROVED, "graph.json"), "utf8"));
  const layouts = JSON.parse(fs.readFileSync(path.join(APPROVED, "layouts.json"), "utf8"));
  const review = validateLayoutReport(report, graph, layouts);
  const outputPath = path.join(APPROVED, "layout-feedback.json");
  const output = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : { version: 1, reviews: [] };
  if (!Array.isArray(output.reviews)) throw new Error("Approved feedback file is invalid.");
  if (output.reviews.some((item) => item.id === review.id)) {
    console.log(`Layout feedback already approved (${review.id}).`);
    process.exit(0);
  }
  output.reviews.push(review);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Approved layout feedback: ${review.verdict} / ${review.mode} / ${review.zone} (${review.id}).`);
}
