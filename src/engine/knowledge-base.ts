import { type Facts, type Value, factCount, factsKey, isSubsetOf } from './facts';

/** One thing that was seen to follow from an entry's inputs, and how often. */
export interface Outcome {
  readonly value: Facts;
  count: number;
}

/**
 * Everything seen to follow from one set of input facts. An entry can hold
 * several different outcomes, each with its own count.
 */
export interface Entry {
  readonly key: string;
  readonly inputs: Facts;
  readonly outcomes: Map<string, Outcome>;
}

export interface QueryResult {
  /** The value of the fact that was asked for. */
  value: Value;
  /** How many input facts the answering entry has. */
  specificity: number;
  /** How many times that outcome was seen. */
  count: number;
  /** The entry the answer came from. */
  entry: Entry;
}

/**
 * A flat store of "these inputs were followed by these outputs", with counts.
 *
 * Nothing is nested. Generality is implicit: an entry with fewer inputs
 * applies more widely, and a query prefers the entry with the most inputs
 * among those that apply.
 */
export class KnowledgeBase {
  private readonly byKey = new Map<string, Entry>();

  /** Record that `inputs` were followed by `outputs`. */
  observe(inputs: Facts, outputs: Facts): void {
    const key = factsKey(inputs);
    let entry = this.byKey.get(key);
    if (!entry) {
      entry = { key, inputs, outcomes: new Map() };
      this.byKey.set(key, entry);
    }

    const outcomeKey = factsKey(outputs);
    let outcome = entry.outcomes.get(outcomeKey);
    if (!outcome) {
      outcome = { value: outputs, count: 0 };
      entry.outcomes.set(outcomeKey, outcome);
    }
    outcome.count += 1;
  }

  /**
   * Find the value of the fact named `want`, given what is `known`.
   *
   * Every entry whose inputs are all contained in `known` applies. Among
   * those, the entry with the most inputs wins, and a tie goes to the outcome
   * seen most often. Returns null when no applying entry mentions `want`.
   */
  query(want: string, known: Facts): QueryResult | null {
    let best: QueryResult | null = null;

    for (const entry of this.byKey.values()) {
      if (!isSubsetOf(entry.inputs, known)) continue;
      const specificity = factCount(entry.inputs);

      for (const outcome of entry.outcomes.values()) {
        if (!Object.hasOwn(outcome.value, want)) continue;
        const better =
          best === null ||
          specificity > best.specificity ||
          (specificity === best.specificity && outcome.count > best.count);
        if (better) {
          best = { value: outcome.value[want]!, specificity, count: outcome.count, entry };
        }
      }
    }

    return best;
  }

  /** All entries, in the order they were first seen. */
  entries(): Entry[] {
    return [...this.byKey.values()];
  }

  get size(): number {
    return this.byKey.size;
  }
}
