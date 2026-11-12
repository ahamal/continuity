import { type Facts, factCount, isSubsetOf } from '../../core/facts';
import { pick } from '../../core/random';
import { type Action, type State, sameState, stateKey } from '../../core/state';
import {
  type Reading,
  changeOf,
  knownOf,
  memoryFor,
  rowsThatApply,
  standing,
  wasMade,
} from '../from-counts/from-counts';
import type { Explorer, Mind, Planner, Prediction, Predictor } from '../parts';

// General first. The store is the from-counts agent's: every combination of
// the facts of each move, each different move counted once. What changes is
// which row answers.
//
// The from-counts agent let the most specific row that applies answer,
// whatever its record. So a row that had already failed went on answering.
// After three bumps into a wall, "right at x = 4 changes nothing" spoke for
// the whole column. When the agent later went right from x = 4 twice, the row
// had held 3 times out of 5, and it still spoke, over "right adds one to x" at
// 23 out of 26. The agent kept going round the wall the one way it knew.
//
// Here the agent starts from the general row and goes down only through rows
// that have held every time:
//
//   1. For a move it has made, that move's own row answers.
//   2. Otherwise it starts from the general row: of the rows with one fact,
//      the one that has been right about the most moves.
//   3. A more specific row beneath that one answers instead, if it has held
//      every time it was seen. The most specific such row does; between rows
//      equally specific, the one with the better standing.
//
// A row that has failed is not followed. It is unfinished. The rows beneath it
// that do hold are followed where they apply, and the general row everywhere
// else. So the edge, where "right at x = 9 changes nothing" has never failed,
// stays one row, and a guess about a wall is dropped the first time it fails.
//
// Still fixed in the code: everything the from-counts agent fixes, and that a
// row must have held every time, not most of the time, to answer for the
// general row.

const size = (row: Reading) => factCount(row.slot.known);
const sameChange = (mind: Mind, a: Reading, b: Reading) =>
  mind.representation.changeNames.every((name) => a.usual.inputs[name] === b.usual.inputs[name]);
const alwaysHeld = (row: Reading) => row.held === row.seen;

/** Whether `a` should speak before `b` when both could. */
function before(a: Reading, b: Reading): boolean {
  if (size(a) !== size(b)) return size(a) > size(b);
  if (standing(a) !== standing(b)) return standing(a) > standing(b);
  return a.held > b.held;
}

/**
 * The row that answers for `known`, or null if none applies. With `minSeen`,
 * rows seen fewer times than that are left out, unless the row is for this
 * exact move.
 */
function speaker(mind: Mind, known: Facts, minSeen = 0): Reading | null {
  const full = factCount(known);
  const rows = rowsThatApply(mind, known).filter((row) => row.seen >= minSeen || size(row) === full);

  // A move it has made.
  const exact = rows.find((row) => size(row) === full);
  if (exact) return exact;

  // The general row: of the rows with one fact, the one right about the most moves.
  let general: Reading | null = null;
  for (const row of rows) {
    if (size(row) !== 1) continue;
    if (
      !general ||
      row.held > general.held ||
      (row.held === general.held && standing(row) > standing(general))
    ) {
      general = row;
    }
  }
  if (!general) return null;

  // Beneath it, only a row that has held every time may answer.
  let specific: Reading | null = null;
  for (const row of rows) {
    if (row === general || !alwaysHeld(row) || !isSubsetOf(general.slot.known, row.slot.known)) continue;
    if (!specific || before(row, specific)) specific = row;
  }
  // A specific row that says the same as the general one adds nothing: the
  // general row has more behind it, so it is the one that answers.
  if (!specific || sameChange(mind, specific, general)) return general;
  return specific;
}

function predictWith(mind: Mind, state: State, action: Action, minSeen: number): Prediction | null {
  const known = knownOf(mind, state, action);
  const row = speaker(mind, known, minSeen);
  if (!row) return null;
  return {
    state: mind.representation.apply(state, changeOf(mind, row.usual)),
    source: size(row) === factCount(known) ? 'specific' : 'general',
    specificity: size(row),
    count: row.held,
    basis: [row.usual.key],
  };
}

// ---- the parts ------------------------------------------------------------

export const generalFirstPredictor: Predictor = {
  predict: (mind, state, action) => predictWith(mind, state, action, 0),
};

/**
 * The from-counts agent's way of exploring, with this agent's way of
 * answering. Curiosity is one minus the standing of the row that answers. It
 * is zero for a move already made and one where no row applies. The agent goes
 * to the nearest move it is most curious about, along moves it has made.
 */
export function seekLeastSureGeneralFirst(): Explorer {
  const curiosity = (mind: Mind, state: State, action: Action): number => {
    if (wasMade(mind, state, action)) return 0;
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
      const { places, led } = memoryFor(mind.kb);
      return mind.actions.map((action) => {
        let tried = 0;
        for (const from of led.values()) if (from.has(action)) tried += 1;
        return { action, seen: tried, needed: Math.max(places.size, 1) };
      });
    },

    choose(mind, state) {
      const { places, led } = memoryFor(mind.kb);
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
 * The from-counts agent's way of planning, with this agent's way of
 * answering. It plans as if rows seen fewer than `minSeen` times did not
 * answer, except for moves the agent has made, and cuts the plan off right
 * after the first move that goes against what it really expects.
 */
export function throughThinRowsGeneralFirst(inner: Planner, minSeen = 5): Planner {
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
