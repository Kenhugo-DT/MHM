import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const factFile = new URL("./curated.json", import.meta.url);
const graphFile = new URL("../../site/public/data/graph.json", import.meta.url);
const slugPattern = /^[a-z0-9][a-z0-9-]*$/;
const tagPattern = /^[a-z0-9][a-z0-9-]*$/;
const factualTypes = new Set(["band", "artist", "guitarist"]);

export function validateCuratedFacts(facts, nodes) {
  const errors = [];
  if (!Array.isArray(facts)) return ["Facts must be an array."];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const seenIds = new Set();
  const countByEntity = new Map();

  for (const [index, fact] of facts.entries()) {
    const at = `Fact ${index + 1}`;
    if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
      errors.push(`${at} must be an object.`);
      continue;
    }
    if (typeof fact.id !== "string" || !slugPattern.test(fact.id)) {
      errors.push(`${at} needs a stable slug id.`);
    } else if (seenIds.has(fact.id)) {
      errors.push(`${at} duplicates id ${fact.id}.`);
    } else {
      seenIds.add(fact.id);
    }

    const node = nodeById.get(fact.entityId);
    if (!node || !factualTypes.has(node.type)) {
      errors.push(`${at} must reference an existing band, artist or guitarist.`);
    }
    const count = (countByEntity.get(fact.entityId) ?? 0) + 1;
    countByEntity.set(fact.entityId, count);
    if (count > 2) errors.push(`${at} exceeds two facts for ${fact.entityId}.`);

    if (typeof fact.text !== "string" || fact.text.length < 35 || fact.text.length > 200) {
      errors.push(`${at} needs a concise fact (35-200 characters).`);
    }
    if (fact.year !== undefined && (!Number.isInteger(fact.year) || fact.year < 1800 || fact.year > 2100)) {
      errors.push(`${at} has an invalid year.`);
    }
    if (!Array.isArray(fact.tags) || fact.tags.length < 1 || fact.tags.length > 5 ||
        fact.tags.some((tag) => typeof tag !== "string" || !tagPattern.test(tag))) {
      errors.push(`${at} needs 1-5 lowercase topic tags.`);
    }
    if (typeof fact.verifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fact.verifiedAt) ||
        Number.isNaN(Date.parse(`${fact.verifiedAt}T00:00:00Z`))) {
      errors.push(`${at} needs a verification date (YYYY-MM-DD).`);
    }

    if (!Array.isArray(fact.sources) || fact.sources.length === 0) {
      errors.push(`${at} needs at least one direct source.`);
      continue;
    }
    if (/\b(first|only|largest|most|oldest|youngest)\b/i.test(fact.text ?? "") && fact.sources.length < 2) {
      errors.push(`${at} needs two sources for a superlative claim.`);
    }
    const urls = new Set();
    for (const source of fact.sources) {
      if (!source || typeof source.label !== "string" || !source.label.trim()) {
        errors.push(`${at} has a source without a label.`);
      }
      try {
        const url = new URL(source.url);
        if (url.protocol !== "https:" || !url.hostname) throw new Error("Not an HTTPS URL.");
        if (urls.has(url.href)) errors.push(`${at} repeats source ${url.href}.`);
        urls.add(url.href);
      } catch {
        errors.push(`${at} has an invalid source URL.`);
      }
    }
  }
  return errors;
}

export function readAndValidateCuratedFacts() {
  const facts = JSON.parse(readFileSync(factFile, "utf8"));
  const graph = JSON.parse(readFileSync(graphFile, "utf8"));
  return { facts, errors: validateCuratedFacts(facts, graph.nodes) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { facts, errors } = readAndValidateCuratedFacts();
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Validated ${facts.length} sourced facts.`);
  }
}
