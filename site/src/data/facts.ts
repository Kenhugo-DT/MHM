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

export function mergeFacts(entityId: string, approved: readonly EntityFact[]): readonly EntityFact[] {
  const curated = factsForEntity(entityId);
  const seen = new Set(curated.map((fact) => fact.text.trim().toLocaleLowerCase("en")));
  return [
    ...curated,
    ...approved.filter((fact) => {
      if (fact.entityId !== entityId) return false;
      const text = fact.text.trim().toLocaleLowerCase("en");
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    }),
  ].slice(0, 2);
}
