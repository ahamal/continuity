import { type Facts, type Value, factCount, factsKey, isSubsetOf } from '../../core/facts';
import type { Entry, KnowledgeBase } from '../../core/knowledge-base';
import { pick } from '../../core/random';
import { type Action, type State, sameState, stateKey } from '../../core/state';
import { combinations, everyCombinationStorage, timesSeen } from '../every-combination/every-combination';
import type { Explorer, Mind, Planner, Prediction, Predictor, Storage } from '../parts';

// A hierarchy read from the counts, with no procedure that builds one.
//
// The store is every combination of the facts of each move, as in the
// every-combination agent, with one difference: a move made before is not
// counted again. A count is a number of different moves.
//
// A row here is some known facts (any of the action and the state before) and
// what the change usually was when they were seen. Two counts come with it:
// how many different moves had those facts (`seen`), and how many of those had
// that change (`held`).
//
// The rows already form a hierarchy, from general to specific: a row with
// more facts is a more specific case of every row made of some of them. To
// answer, the agent falls down that hierarchy to the most specific row that
// applies, and that row speaks. Nothing more is needed for a general row to
// be right at the edge: "left, x = 0" is more specific than "left".
//
// One thing is added. Two rows can be equally specific and disagree, such as
// "left, x = 0" and "left, y = 7". Then the one with the better standing
// speaks. Standing is held divided by (seen + 1): as if the row were to fail
// the next time it is tested, so a row seen once is a guess.
//
// Still fixed in the code: that the question is what the change will be, that
// a change is added to a state, and the "+ 1" above.

/** Some known facts, and every change seen with them. */
interface Slot {
  key: string;
  known: Facts;
  /** One stored row per change seen with these facts: the facts and that change. */
  changes: Entry[];
}

/** A slot read as a row: what it usually says, and how well that has held. */
export interface Reading {
  slot: Slot;
  /** The stored row for the usual change. */
  usual: Entry;
  held: number;
  seen: number;
}

interface Memory {
  slots: Map<string, Slot>;
  /** Every state it has stood in. */
  places: Map<string, State>;
  /** Where each move it has made led. */
  led: Map<string, Map<Action, State>>;
}

const memories = new WeakMap<KnowledgeBase, Memory>();

function memoryOf(kb: KnowledgeBase): Memory {
  let memory = memories.get(kb);
  if (!memory) memories.set(kb, (memory = { slots: new Map(), places: new Map(), led: new Map() }));
  return memory;
}

const knownOf = (mind: Mind, state: State, action: Action): Facts => ({
  action,
  ...mind.representation.describe(state),
});

const changeOf = (mind: Mind, entry: Entry): Facts => {
  const change: Record<string, Value> = {};
  for (const name of mind.representation.changeNames) change[name] = entry.inputs[name]!;
  return change;
};

const sameChange = (mind: Mind, a: Entry, b: Entry) =>
  mind.representation.changeNames.every((name) => a.inputs[name] === b.inputs[name]);

/** Read a slot as a row. Its usual change is the one seen most; a tie goes to the one seen first. */
function read(slot: Slot): Reading {
  let usual = slot.changes[0]!;
  let seen = 0;
  for (const entry of slot.changes) {
    seen += timesSeen(entry);
    if (timesSeen(entry) > timesSeen(usual)) usual = entry;
  }
  return { slot, usual, held: timesSeen(usual), seen };
}

const holds = (row: Reading) => row.held === row.seen;
const standing = (row: Reading) => row.held / (row.seen + 1);

/** Every row that applies to `known`: one for each part of it that has been seen. */
function applicable(mind: Mind, known: Facts): Reading[] {
  const { slots } = memoryOf(mind.kb);
  const rows: Reading[] = [];
  for (const part of combinations(known)) {
    const slot = slots.get(factsKey(part));
    if (slot) rows.push(read(slot));
  }
  return rows;
}

/**
 * The row that speaks for `known`, or null if none applies. With `minSeen`,
 * rows seen fewer times than that are left out, unless the row is for this
 * exact move.
 */
function speaker(mind: Mind, known: Facts, minSeen = 0): Reading | null {
  const full = factCount(known);
  const rows = applicable(mind, known).filter(
    (row) => row.seen >= minSeen || factCount(row.slot.known) === full,
  );

  // The most specific row speaks. Between rows equally specific, the one with
  // the better standing, then the one that has held more often.
  let best: Reading | null = null;
  for (const row of rows) {
    const better =
      !best ||
      factCount(row.slot.known) > factCount(best.slot.known) ||
      (factCount(row.slot.known) === factCount(best.slot.known) &&
        (standing(row) > standing(best) || (standing(row) === standing(best) && row.held > best.held)));
    if (better) best = row;
  }
  return best;
}

function predictWith(mind: Mind, state: State, action: Action, minSeen: number): Prediction | null {
  const known = knownOf(mind, state, action);
  const row = speaker(mind, known, minSeen);
  if (!row) return null;
  return {
    state: mind.representation.apply(state, changeOf(mind, row.usual)),
    source: factCount(row.slot.known) === factCount(known) ? 'specific' : 'general',
    specificity: factCount(row.slot.known),
    count: row.held,
    basis: [row.usual.key],
  };
}

const made = (mind: Mind, state: State, action: Action) =>
  memoryOf(mind.kb).led.get(stateKey(state))?.has(action) ?? false;

// ---- the hierarchy, for looking at ----------------------------------------

/** A row and the exceptions beneath it, in the shape the viewer draws. */
export interface ReadRow {
  id: string;
  facts: Facts;
  change: Facts;
  /** How many different moves it speaks for itself: those none of its exceptions cover. */
  reach: number;
  /** How many of those went as it says. */
  holds: number;
  exceptions: ReadRow[];
}

/**
 * The hierarchy that the counts support, for the viewer. Nothing here is used
 * to answer: answering reads the same counts directly (see `speaker`).
 *
 * The top rows are the rows with one fact. Under each are its exceptions: the
 * rows that contain it, hold, and say something different, leaving out any
 * that sit under another such row. Top rows are ordered by how many moves
 * they speak for themselves, so a row that needs few exceptions comes first.
 */
export function readHierarchy(mind: Mind): ReadRow[] {
  const { slots } = memoryOf(mind.kb);
  const all = [...slots.values()].map(read);
  const size = (row: Reading) => factCount(row.slot.known);
  const full = Math.max(0, ...all.map(size));
  const moves = all.filter((row) => size(row) === full);

  const under = (top: Reading): ReadRow => {
    const candidates = all.filter(
      (row) =>
        size(row) > size(top) &&
        isSubsetOf(top.slot.known, row.slot.known) &&
        holds(row) &&
        !sameChange(mind, row.usual, top.usual),
    );
    // Keep the widest exceptions: those not sitting under another one.
    const widest = candidates.filter(
      (row) => !candidates.some((other) => other !== row && size(other) < size(row) && isSubsetOf(other.slot.known, row.slot.known)),
    );
    const own = moves.filter(
      (move) =>
        isSubsetOf(top.slot.known, move.slot.known) &&
        !widest.some((exception) => isSubsetOf(exception.slot.known, move.slot.known)),
    );
    return {
      id: top.usual.key,
      facts: top.slot.known,
      change: changeOf(mind, top.usual),
      reach: own.length,
      holds: own.filter((move) => sameChange(mind, move.usual, top.usual)).length,
      // An exception holds, so nothing sits under it that says otherwise.
      exceptions: widest.map((row) => ({
        id: row.usual.key,
        facts: row.slot.known,
        change: changeOf(mind, row.usual),
        reach: row.seen,
        holds: row.held,
        exceptions: [],
      })),
    };
  };

  return all
    .filter((row) => size(row) === 1)
    .map(under)
    .sort((a, b) => b.reach - a.reach || b.holds - a.holds);
}

/** How many different moves the agent has made or watched. */
export function movesCounted(mind: Mind): number {
  let count = 0;
  for (const from of memoryOf(mind.kb).led.values()) count += from.size;
  return count;
}

// ---- the parts ------------------------------------------------------------

/** The every-combination store, counting each different move once. */
export const countOnceStorage: Storage = {
  store(mind, before, action, next) {
    const memory = memoryOf(mind.kb);
    memory.places.set(stateKey(before), before);
    memory.places.set(stateKey(next), next);
    let from = memory.led.get(stateKey(before));
    if (!from) memory.led.set(stateKey(before), (from = new Map()));
    if (from.has(action)) return []; // Already counted.
    from.set(action, next);

    const writes = everyCombinationStorage.store(mind, before, action, next);
    const change = mind.representation.change(before, next);
    for (const part of combinations(knownOf(mind, before, action))) {
      const key = factsKey(part);
      let slot = memory.slots.get(key);
      if (!slot) memory.slots.set(key, (slot = { key, known: part, changes: [] }));
      const entry = mind.kb.get(factsKey({ ...part, ...change }))!;
      if (!slot.changes.includes(entry)) slot.changes.push(entry);
    }
    return writes;
  },
};

export const fromCountsPredictor: Predictor = {
  predict: (mind, state, action) => predictWith(mind, state, action, 0),
};

/**
 * Curiosity is how unsure the row that speaks is: one minus its standing. It
 * is zero for a move already made and one where no row applies. The agent
 * looks at every place it has stood in, picks the move it is most curious
 * about, the nearest if several are equal, and walks there along moves it has
 * made. It is confident only when it has made every move from every place it
 * has stood in.
 */
export function seekLeastSure(): Explorer {
  const curiosity = (mind: Mind, state: State, action: Action): number => {
    if (made(mind, state, action)) return 0;
    const row = speaker(mind, knownOf(mind, state, action));
    return row ? 1 - standing(row) : 1;
  };

  const bestAt = (mind: Mind, state: State) => {
    let best: { action: Action; curiosity: number } | null = null;
    for (const action of mind.actions) {
      const score = curiosity(mind, state, action);
      if (score > 0 && (!best || score > best.curiosity)) best = { action, curiosity: score };
    }
    return best;
  };

  return {
    curiosity,

    confidence(mind) {
      const { places, led } = memoryOf(mind.kb);
      return mind.actions.map((action) => {
        let tried = 0;
        for (const from of led.values()) if (from.has(action)) tried += 1;
        return { action, seen: tried, needed: Math.max(places.size, 1) };
      });
    },

    choose(mind, state) {
      const { places, led } = memoryOf(mind.kb);
      const scores = mind.actions.map((action) => ({ action, curiosity: curiosity(mind, state, action) }));

      let highest = bestAt(mind, state)?.curiosity ?? 0;
      for (const place of places.values()) highest = Math.max(highest, bestAt(mind, place)?.curiosity ?? 0);
      if (highest === 0) {
        return { action: pick(mind.actions, mind.random), curiosity: 0, scores, random: true };
      }

      // Walk outwards along moves already made until a place with such a move is found.
      const queue: { state: State; first: Action | null }[] = [{ state, first: null }];
      const visited = new Set([stateKey(state)]);
      while (queue.length > 0) {
        const { state: at, first } = queue.shift()!;
        const found = bestAt(mind, at);
        if (found && found.curiosity === highest) {
          return first === null
            ? { action: found.action, curiosity: found.curiosity, scores, random: false }
            : { action: first, curiosity: found.curiosity, scores, random: false, heading: at };
        }
        for (const [action, next] of led.get(stateKey(at)) ?? []) {
          if (visited.has(stateKey(next))) continue;
          visited.add(stateKey(next));
          queue.push({ state: next, first: first ?? action });
        }
      }

      const here = bestAt(mind, state);
      return here
        ? { action: here.action, curiosity: here.curiosity, scores, random: false }
        : { action: pick(mind.actions, mind.random), curiosity: 0, scores, random: true };
    },
  };
}

/**
 * Planning that tries to break its own guesses. It plans as if rows seen fewer
 * than `minSeen` times did not speak, except for moves the agent has made. The
 * plan is cut off right after the first move that goes against what the agent
 * really expects, so that it sees what happens there and plans again.
 */
export function throughThinRows(inner: Planner, minSeen = 5): Planner {
  return {
    plan(mind, start, goal) {
      const hopeful = (state: State, action: Action) =>
        predictWith(mind, state, action, minSeen) ?? predictWith(mind, state, action, 0);
      const plan = inner.plan(
        {
          kb: mind.kb,
          actions: mind.actions,
          representation: mind.representation,
          random: mind.random,
          predict: hopeful,
          curiosity: (state, action) => mind.curiosity(state, action),
        },
        start,
        goal,
      );

      let state = start;
      for (let i = 0; i < plan.path.length; i++) {
        const hoped = hopeful(state, plan.path[i]!);
        const expected = mind.predict(state, plan.path[i]!);
        if (!hoped) break;
        if (expected && !sameState(expected.state, hoped.state)) {
          return { ...plan, path: plan.path.slice(0, i + 1) };
        }
        state = hoped.state;
      }
      return plan;
    },
  };
}
