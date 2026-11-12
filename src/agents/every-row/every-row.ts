import { type Facts, type Value, factCount, factsKey } from '../../core/facts';
import type { Entry, KnowledgeBase } from '../../core/knowledge-base';
import { pick } from '../../core/random';
import type { Action, State } from '../../core/state';
import { combinations, everyCombinationStorage, timesSeen } from '../every-combination/every-combination';
import type { Explorer, Mind, Predictor, Storage } from '../parts';

// The store is the same as the every-combination agent's: every combination of the
// facts of each move. What changes is how it is read. That agent read two
// combinations that were named in the code. Here no combination is named. To
// answer a question, every row that could answer it gets a say, and one rule
// decides between them.
//
// The question is always: knowing the action and the state, what is the
// change? A row has a say when it is made of some of the known facts and one
// fact about the change. Such a row is read as "when these facts were seen,
// this change was seen with them". Two counts measure it:
//
//   seen   how often its known facts were seen together
//   held   how often they were seen together with this change
//
// The rule: the row that held the largest share of the times wins. A tie goes
// to the row with more facts, then to the one that held more often.
//
// Still fixed in the code: that the question is about the change, and that a
// change is added to a state to get the next one.

/** One row's answer to "what is this part of the change?". */
export interface Say {
  /** The value it gives for the change. */
  value: Value;
  /** How often its known facts were seen with that value. */
  held: number;
  /** How often its known facts were seen at all. */
  seen: number;
  /** How many known facts it rests on. */
  facts: number;
  /** The row itself. */
  entry: Entry;
}

/** Whether `a` beats `b` under the rule. */
function beats(a: Say, b: Say): boolean {
  // Compare the shares held/seen without dividing.
  const share = a.held * b.seen - b.held * a.seen;
  if (share !== 0) return share > 0;
  if (a.facts !== b.facts) return a.facts > b.facts;
  return a.held > b.held;
}

// ---- finding the rows that have a say -------------------------------------
//
// An index from "these known facts, asked about this part of the change" to
// the rows made of exactly those. It holds nothing that the rows do not.

type Index = Map<string, Entry[]>;
const indexes = new WeakMap<KnowledgeBase, Index>();

const slot = (known: Facts, ask: string) => `${factsKey(known)}?${ask}`;

function known(mind: Mind, state: State, action: Action): Facts {
  return { action, ...mind.representation.describe(state) };
}

/** Every row with a say about `ask`, given what is known. */
export function says(mind: Mind, knownFacts: Facts, ask: string): Say[] {
  const index = indexes.get(mind.kb);
  if (!index) return [];
  const all: Say[] = [];
  for (const part of combinations(knownFacts)) {
    const rows = index.get(slot(part, ask));
    if (!rows) continue;
    const seen = timesSeen(mind.kb.get(factsKey(part))!);
    for (const entry of rows) {
      all.push({ value: entry.inputs[ask]!, held: timesSeen(entry), seen, facts: factCount(part), entry });
    }
  }
  return all;
}

/** The row that wins the say about `ask`, or null if no row has one. */
export function answer(mind: Mind, knownFacts: Facts, ask: string): Say | null {
  let best: Say | null = null;
  for (const say of says(mind, knownFacts, ask)) {
    if (!best || beats(say, best)) best = say;
  }
  return best;
}

/**
 * How well backed the winning answer is: the most times any row with a say
 * has held with that same value. Zero when no row has a say.
 */
function backing(mind: Mind, knownFacts: Facts, ask: string): number {
  const all = says(mind, knownFacts, ask);
  let best: Say | null = null;
  for (const say of all) if (!best || beats(say, best)) best = say;
  if (!best) return 0;
  let most = 0;
  for (const say of all) if (say.value === best.value && say.held > most) most = say.held;
  return most;
}

// ---- the parts ------------------------------------------------------------

/** The every-combination storage, plus the index this agent reads through. */
export const everyRowStorage: Storage = {
  store(mind, before, action, next) {
    const writes = everyCombinationStorage.store(mind, before, action, next);

    let index = indexes.get(mind.kb);
    if (!index) indexes.set(mind.kb, (index = new Map()));
    const change = mind.representation.change(before, next);
    for (const part of combinations(known(mind, before, action))) {
      for (const ask of mind.representation.changeNames) {
        const entry = mind.kb.get(factsKey({ ...part, [ask]: change[ask]! }))!;
        const key = slot(part, ask);
        const rows = index.get(key);
        if (!rows) index.set(key, [entry]);
        else if (!rows.includes(entry)) rows.push(entry);
      }
    }
    return writes;
  },
};

/** Ask every row, for each part of the change, and add the winning change to the state. */
export const everyRowPredictor: Predictor = {
  predict(mind, state, action) {
    const knownFacts = known(mind, state, action);
    const change: Record<string, Value> = {};
    const basis: string[] = [];
    let count = Infinity;
    let facts = 0;

    for (const ask of mind.representation.changeNames) {
      const say = answer(mind, knownFacts, ask);
      if (!say) return null;
      change[ask] = say.value;
      basis.push(say.entry.key);
      count = Math.min(count, say.held);
      facts = Math.max(facts, say.facts);
    }

    return {
      state: mind.representation.apply(state, change),
      // `specific` when a winning row rests on everything that is known.
      source: facts === factCount(knownFacts) ? 'specific' : 'general',
      specificity: facts,
      count,
      basis,
    };
  },
};

/**
 * Curiosity from how well the answer is backed. The agent is curious about a
 * move when no row that agrees with its answer has held `threshold` times:
 * one divided by the most times such a row has held. It is fully curious when
 * no row has a say.
 */
export function curiosityFromBacking(threshold = 5): Explorer {
  /** The weakest backing over the parts of the change. */
  const weakest = (mind: Mind, knownFacts: Facts) =>
    Math.min(...mind.representation.changeNames.map((ask) => backing(mind, knownFacts, ask)));

  const explorer: Explorer = {
    curiosity(mind, state, action) {
      const held = weakest(mind, known(mind, state, action));
      if (held === 0) return 1;
      if (held >= threshold) return 0;
      return 1 / held;
    },

    /** An action is trusted when its answer is backed well enough knowing the action alone. */
    confidence(mind) {
      return mind.actions.map((action) => ({
        action,
        seen: weakest(mind, { action }),
        needed: threshold,
      }));
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
