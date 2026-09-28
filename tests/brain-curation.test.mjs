import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const feedback = readJson("brain/data/approved/curator-feedback.json");
const learning = readJson("brain/data/approved/learning-model.json");
const organization = readJson("brain/data/approved/organization-model.json");
const approvedFacts = readJson("brain/data/approved/fact-evidence.json");
const curatedFacts = readJson("shared/facts/curated.json");

test("fact interpretations resolve to sourced candidates and reach their nodes", () => {
  assert.equal(learning.warnings.length, 0);
  assert.equal(learning.samples.factNotes, feedback.factFeedback.length);

  for (const item of feedback.factFeedback) {
    const batch = readJson(`brain/data/fact-batches/${item.batchId}.json`);
    const fact = batch.facts[item.factIndex - 1];
    const ref = `${item.batchId}#${item.factIndex}`;
    const learned = learning.nodes[fact[0]]?.factNotes?.find((note) => note.ref === ref);

    assert.ok(learned, `Missing interpretation for ${ref}`);
    assert.equal(learned.sourceUrl, batch.sources[fact[3]][1]);
    assert.deepEqual(learned.relatedNodes, item.relatedNodes);
    assert.equal(learned.interpretation, item.interpretation);
    assert.equal(learned.approvalAtLastSync, "approved");
  }
});

test("approved fact coverage reaches the learning and organization models", () => {
  const allFacts = [...approvedFacts.facts, ...curatedFacts];
  const coveredIds = new Set(allFacts.map((fact) => fact.entityId));
  assert.equal(learning.approvedFactEvidence.syncedAt, approvedFacts.syncedAt);
  assert.equal(learning.samples.approvedFacts, allFacts.length);
  assert.equal(learning.samples.approvedSupabaseFacts, approvedFacts.facts.length);
  assert.equal(learning.samples.curatedFacts, curatedFacts.length);
  assert.equal(learning.samples.approvedFactNodes, coveredIds.size);
  assert.equal(learning.samples.approvedFactNotes, feedback.factFeedback.length);

  for (const id of coveredIds) {
    const count = allFacts.filter((fact) => fact.entityId === id).length;
    assert.equal(learning.nodes[id].approvedFactCount, count);
    assert.equal(organization.nodes[id].approvedFactCount, count);
  }
  for (const zone of Object.values(organization.zones)) {
    if (zone.nodeCount) {
      assert.equal(zone.factCoverageRate,
        Number((zone.approvedFactNodes / zone.nodeCount).toFixed(3)));
    }
  }
});

test("anchor-only bridge policies cannot attach to unrelated nodes", () => {
  const policies = feedback.bridgePolicies.filter((policy) => policy.anchorsOnly);
  assert.ok(policies.length > 0);

  for (const policy of policies) {
    const matches = Object.values(organization.layoutIntelligence.bridgeNodes)
      .filter((node) => node.reason.includes(policy.id));
    assert.ok(matches.length > 0, `No bridge nodes matched ${policy.id}`);
    for (const node of matches) {
      assert.ok(policy.anchorNodes.includes(node.id), `${node.id} matched ${policy.id} without being an anchor`);
    }
  }
});
