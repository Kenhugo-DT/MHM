import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { EntityFact } from "../data/facts";

interface FactSpotlightProps {
  facts: readonly EntityFact[];
}

export function FactSpotlight({ facts }: FactSpotlightProps) {
  const [index, setIndex] = useState(0);
  const fact = facts[index];

  if (!fact) return null;

  return (
    <section className="fact-spotlight" aria-label="Did you know?">
      <div className="fact-heading">
        <h3>Did you know?</h3>
        {facts.length > 1 && (
          <div className="fact-navigation">
            <button
              type="button"
              onClick={() => setIndex((current) => (current - 1 + facts.length) % facts.length)}
              title="Previous fact"
              aria-label="Previous fact"
            >
              <ChevronLeft aria-hidden="true" size={15} />
            </button>
            <span aria-label={`Fact ${index + 1} of ${facts.length}`}>
              {index + 1}/{facts.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex((current) => (current + 1) % facts.length)}
              title="Next fact"
              aria-label="Next fact"
            >
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          </div>
        )}
      </div>
      <p aria-live="polite">{fact.text}</p>
      <div className="fact-sources" aria-label="Fact sources">
        {fact.sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
            {source.label} <ExternalLink aria-hidden="true" size={12} />
          </a>
        ))}
      </div>
    </section>
  );
}
