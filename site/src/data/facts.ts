import curatedFacts from "../../../shared/facts/curated.json";

export interface EntityFact {
  id: string;
  entityId: string;
  text: string;
  year?: number;
  tags: string[];
  verifiedAt: string;
  sources: Array<{ label: string; url: string }>;
}

const factsByEntity = new Map<string, EntityFact[]>();

for (const fact of curatedFacts as EntityFact[]) {
  const facts = factsByEntity.get(fact.entityId) ?? [];
  facts.push(fact);
  factsByEntity.set(fact.entityId, facts);
}

export function factsForEntity(entityId: string): readonly EntityFact[] {
  return factsByEntity.get(entityId) ?? [];
}
