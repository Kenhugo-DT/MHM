import test from "node:test";
import assert from "node:assert/strict";
import { readAndValidateCuratedFacts, validateCuratedFacts } from "../shared/facts/validate.mjs";

test("published facts are sourced and include every node type", () => {
  const { facts, errors } = readAndValidateCuratedFacts();
  assert.deepEqual(errors, []);
  const entityIds = new Set(facts.map((fact) => fact.entityId));
  assert.ok(entityIds.size >= 20);
  assert.ok(facts.some((fact) => fact.entityId === "metallica" && fact.sources.length >= 2));
  for (const id of ["jazz", "fender", "fender-stratocaster"]) {
    assert.ok(entityIds.has(id), `Missing a fact for ${id}`);
  }
});

test("unsourced or excessive facts cannot pass the publication gate", () => {
  const nodes = [{ id: "metallica", type: "band" }];
  const base = {
    id: "metallica-one",
    entityId: "metallica",
    text: "Metallica played a concert in Antarctica in December 2013.",
    tags: ["touring"],
    verifiedAt: "2026-09-25",
    sources: [{ label: "Metallica", url: "https://www.metallica.com/history" }],
  };
  assert.deepEqual(validateCuratedFacts([base], nodes), []);
  assert.ok(validateCuratedFacts([{ ...base, sources: [] }], nodes).length > 0);
  assert.ok(validateCuratedFacts([{ ...base, entityId: "missing" }], nodes).length > 0);
  assert.ok(validateCuratedFacts([{ ...base, text: "The first band to play on every continent." }], nodes)
    .some((error) => error.includes("two sources")));
  assert.ok(validateCuratedFacts([
    base,
    { ...base, id: "metallica-two" },
    { ...base, id: "metallica-three" },
  ], nodes).some((error) => error.includes("exceeds two")));
});
