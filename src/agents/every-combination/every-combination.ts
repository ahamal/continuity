import { type Facts, type Value, factCount, factsKey } from '../../core/facts';
import type { Entry, KnowledgeBase } from '../../core/knowledge-base';
import { pick } from '../../core/random';
import type { Action, State } from '../../core/state';
import type { Explorer, Mind, Predictor, Storage } from '../parts';

// Nothing is chosen in advance. One move is a set of facts
// seen together: the action, the state before, the state after and the change.
// Every combination of those facts is written as its own row, with a count of
// how often those facts were seen together. No fact is set apart as the
// question or as the answer.
//
// This is for looking at what the store turns into, not for being small. With
// n facts a move writes 2^n - 1 rows.
//
// Predicting and curiosity ask the same two questions as the two-level agent, so the
// agent behaves exactly as it did there. Only what is stored has changed.

/** Rows here have nothing set apart as "what followed": the facts are the row. */
const TOGETHER: Facts = {};

/** Name of a fact about the state after the move: `x` becomes `x1`. */
const after = (name: string) => `${name}1`;

/** How many times all the facts of a row were seen together. */
export function timesSeen(entry: Entry): number {
  let total = 0;
  for (const outcome of entry.outcomes.values()) total += outcome.count;
  return total;
}

/** Everything seen in one move, as one set of facts. */
export function moveFacts(mind: Mind, before: State, action: Action, next: State): Facts {
  const facts: Record<string, Value> = { action, ...mind.representation.describe(before) };
  for (const [name, value] of Object.entries(mind.representation.describe(next))) {
    facts[after(name)] = value;
  }
  return { ...facts, ...mind.representation.change(before, next) };
}

/** Every way of keeping some of the facts and leaving the rest out, except keeping none. */
export function combinations(facts: Facts): Facts[] {
  const names = Object.keys(facts);
  const all: Facts[] = [];
  for (let mask = 1; mask < 1 << names.length; mask++) {
    const part: Record<string, Value> = {};
    names.forEach((name, i) => {
      if (mask & (1 << i)) part[name] = facts[name]!;
    });
    all.push(part);
  }
  return all;
}

/** Keep only the named facts. */
function only(facts: Facts, names: readonly string[]): Facts {
  const part: Record<string, Value> = {};
  for (const name of names) part[name] = facts[name]!;
  return part;
}

// ---- finding rows without reading the whole store -------------------------
//
// The agent asks two questions: "what followed this action in this exact
// state?" and "what change goes with this action?". Each is answered by rows
// of one combination. This index points from the known half of such a row to
// the rows that contain it. It holds nothing that the rows do not.

type Index = Map<string, Entry[]>;
const indexes = new WeakMap<KnowledgeBase, Index>();

const question = (known: Facts, ask: readonly string[]) => `${factsKey(known)}?${ask.join(',')}`;

function remember(kb: KnowledgeBase, known: Facts, ask: readonly string[], row: Facts): void {
  let index = indexes.get(kb);
  if (!index) indexes.set(kb, (index = new Map()));
  const entry = kb.get(factsKey(row))!;
  const key = question(known, ask);
  const rows = index.get(key);
  if (!rows) index.set(key, [entry]);
  else if (!rows.includes(entry)) rows.push(entry);
}

/** Of the rows made of `known` and the facts named in `ask`, the one seen most often. */
function mostSeen(kb: KnowledgeBase, known: Facts, ask: readonly string[]): Entry | null {
  let best: Entry | null = null;
  for (const entry of indexes.get(kb)?.get(question(known, ask)) ?? []) {
    if (!best || timesSeen(entry) > timesSeen(best)) best = entry;
  }
  return best;
}

/** The names the two questions are made of. */
function names(mind: Mind, state: State) {
  const before = Object.keys(mind.representation.describe(state));
  return { before, after: before.map(after), change: mind.representation.changeNames };
}

// ---- the parts ------------------------------------------------------------

export const everyCombinationStorage: Storage = {
  store(mind, before, action, next) {
    const facts = moveFacts(mind, before, action, next);
    const writes = combinations(facts).map((part) => mind.kb.observe(part, TOGETHER));

    const n = names(mind, before);
    const here = only(facts, ['action', ...n.before]);
    remember(mind.kb, here, n.after, only(facts, ['action', ...n.before, ...n.after]));
    remember(mind.kb, { action }, n.change, only(facts, ['action', ...n.change]));
    return writes;
  },
};

/** The same rule as the two-level agent: the exact case if seen, otherwise the action's usual change. */
export const exactThenUsualChange: Predictor = {
  predict(mind, state, action) {
    const n = names(mind, state);

    const exact = mostSeen(mind.kb, { ...mind.representation.describe(state), action }, n.after);
    if (exact) {
      return {
        state: n.after.map((name) => exact.inputs[name] as number),
        source: 'specific',
        specificity: factCount(exact.inputs),
        count: timesSeen(exact),
        basis: [exact.key],
      };
    }

    const usual = mostSeen(mind.kb, { action }, n.change);
    if (!usual) return null;
    return {
      state: mind.representation.apply(state, usual.inputs),
      source: 'general',
      specificity: factCount(usual.inputs),
      count: timesSeen(usual),
      basis: [usual.key],
    };
  },
};

/**
 * The same curiosity as the two-level agent. Zero once this exact case has been
 * seen, or once the action's usual change has been seen `threshold` times.
 * Otherwise one divided by the number of times it has been seen.
 */
export function curiosityFromCombinations(threshold = 5): Explorer {
  const usualCount = (mind: Mind, state: State, action: Action) => {
    const usual = mostSeen(mind.kb, { action }, names(mind, state).change);
    return usual ? timesSeen(usual) : 0;
  };

  const explorer: Explorer = {
    curiosity(mind, state, action) {
      const n = names(mind, state);
      if (mostSeen(mind.kb, { ...mind.representation.describe(state), action }, n.after)) return 0;

      const seen = usualCount(mind, state, action);
      if (seen === 0) return 1;
      if (seen >= threshold) return 0;
      return 1 / seen;
    },

    confidence(mind) {
      // The names of the change do not depend on the state, so any state will do.
      const change = mind.representation.changeNames;
      return mind.actions.map((action) => {
        const usual = mostSeen(mind.kb, { action }, change);
        return { action, seen: usual ? timesSeen(usual) : 0, needed: threshold };
      });
    },

    choose(mind, state) {
      const scores = mind.actions.map((action) => ({
        action,
        curiosity: explorer.curiosity(mind, state, action),
      }));

      let best = scores[0]!;
      for (const score of scores) {
        if (score.curiosity > best.curiosity) best = score;
      }

      if (best.curiosity === 0) {
        // Nothing here is interesting. Move at random to find something that is.
        return { action: pick(mind.actions, mind.random), curiosity: 0, scores, random: true };
      }
      return { action: best.action, curiosity: best.curiosity, scores, random: false };
    },
  };
  return explorer;
}
