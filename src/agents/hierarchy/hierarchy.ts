import { type Facts, type Value, factCount, factsKey, isSubsetOf } from '../../core/facts';
import type { KnowledgeBase } from '../../core/knowledge-base';
import { pick } from '../../core/random';
import { type Action, type State, sameState, stateKey } from '../../core/state';
import type { Explorer, Mind, Planner, Predictor, Storage } from '../parts';

// A hierarchy in which every row holds. Built by hand, as a target: it shows
// the shape that is wanted, not that the shape comes out of counts. It does
// not use the store of every combination.
//
// The every-row agent gave every row a score and let the scores compete, so "left moves
// you" ended up at 3 out of 9 beside "left at x = 0 does nothing" at 6 out of
// 6. Here the two do not compete. A row says what an action does. Where it
// fails, a more specific row is put beneath it as an exception. The exception
// speaks first, and the cases it covers no longer count for or against the
// row above. So both hold every time: the general row wherever no exception
// applies, and the exception where it does.
//
// A row is: these facts, then this change. Its facts always include the
// action. The first row for an action has the action alone.
//
// Counts are of different moves, not of repeats. Making the same move in the
// same place five times is one thing known, not five.
//
// Still fixed in the code: that a row is about what an action changes, that a
// change is added to a state, and the order in which facts are tried when two
// explain a failure equally well (the order the state lists them).

/** One different move the agent has seen: where, what it did, and what changed. */
interface Case {
  /** The action and the state before, as facts. */
  known: Facts;
  change: Facts;
  changeKey: string;
}

/** One row of the hierarchy. */
export interface Row {
  /** Unique name of the row, used to say which rows a prediction came from. */
  id: string;
  /** When these facts hold... */
  facts: Facts;
  /** ...this is the change. */
  change: Facts;
  /** How many different moves it speaks for: those its exceptions do not cover. */
  reach: number;
  /** How many of those went as it says. Equal to `reach` when the row holds. */
  holds: number;
  /** More specific rows that speak in its place where they apply. */
  exceptions: Row[];
}

/** What the agent remembers beside the knowledge base: the moves seen, and the hierarchy built from them. */
interface Memory {
  cases: Map<string, Case>;
  /** Every state it has stood in. */
  places: Map<string, State>;
  /** Where each move it has made led: state, then action, then the state after. */
  led: Map<string, Map<Action, State>>;
  /** One hierarchy per action, rebuilt when a new move has been seen. */
  roots: Map<Action, Row> | null;
}

const memories = new WeakMap<KnowledgeBase, Memory>();

function memoryOf(kb: KnowledgeBase): Memory {
  let memory = memories.get(kb);
  if (!memory) memories.set(kb, (memory = { cases: new Map(), places: new Map(), led: new Map(), roots: null }));
  return memory;
}

const knownOf = (mind: Mind, state: State, action: Action): Facts => ({
  action,
  ...mind.representation.describe(state),
});

// ---- building the hierarchy -----------------------------------------------

/** Every way of choosing `size` of the names. */
function choose(names: readonly string[], size: number): string[][] {
  if (size === 0) return [[]];
  if (names.length < size) return [];
  const [first, ...rest] = names;
  return [...choose(rest, size - 1).map((chosen) => [first!, ...chosen]), ...choose(rest, size)];
}

/**
 * The row for `facts`, built from the cases those facts cover.
 *
 * It says what most of them did. Then, while some case still goes against it,
 * it looks for the fewest extra facts that pick out cases that all go against
 * it and none that go with it. Of those, it takes the one that covers the most
 * such cases, makes it an exception, and hands those cases over to it.
 */
function build(facts: Facts, cases: readonly Case[]): Row {
  // What most of the cases did. A tie goes to what was seen first.
  const tally = new Map<string, { change: Facts; count: number }>();
  for (const item of cases) {
    const entry = tally.get(item.changeKey) ?? { change: item.change, count: 0 };
    entry.count += 1;
    tally.set(item.changeKey, entry);
  }
  let usual = { key: '', change: {} as Facts, count: 0 };
  for (const [key, entry] of tally) {
    if (entry.count > usual.count) usual = { key, ...entry };
  }

  const free = Object.keys(cases[0]?.known ?? {}).filter((name) => !Object.hasOwn(facts, name));
  const exceptions: Row[] = [];
  let rest = [...cases];

  for (;;) {
    const failures = rest.filter((item) => item.changeKey !== usual.key);
    if (failures.length === 0) break;

    let best: { extra: Facts; covered: Case[] } | null = null;
    for (let size = 1; size <= free.length && !best; size++) {
      const tried = new Set<string>();
      for (const failure of failures) {
        for (const names of choose(free, size)) {
          const extra: Record<string, Value> = {};
          for (const name of names) extra[name] = failure.known[name]!;
          const key = factsKey(extra);
          if (tried.has(key)) continue;
          tried.add(key);

          const covered = rest.filter((item) => isSubsetOf(extra, item.known));
          if (covered.some((item) => item.changeKey === usual.key)) continue; // It would take a case that went as the row says.
          if (!best || covered.length > best.covered.length) best = { extra, covered };
        }
      }
    }
    // The same move went two ways. No fact can tell those apart, so the row is left not holding.
    if (!best) break;

    exceptions.push(build({ ...facts, ...best.extra }, best.covered));
    const taken = new Set(best.covered);
    rest = rest.filter((item) => !taken.has(item));
  }

  return {
    id: factsKey(facts),
    facts,
    change: usual.change,
    reach: rest.length,
    holds: rest.filter((item) => item.changeKey === usual.key).length,
    exceptions,
  };
}

function rootsOf(mind: Mind): Map<Action, Row> {
  const memory = memoryOf(mind.kb);
  if (!memory.roots) {
    memory.roots = new Map();
    for (const action of mind.actions) {
      const cases = [...memory.cases.values()].filter((item) => item.known.action === action);
      if (cases.length > 0) memory.roots.set(action, build({ action }, cases));
    }
  }
  return memory.roots;
}

/**
 * The row that speaks for `known`: the deepest exception that applies.
 *
 * With `minReach`, an exception that rests on fewer different moves than that
 * is passed over and the row above it speaks instead. Such an exception is
 * still a guess about how far a failure reaches.
 */
function speaker(row: Row, known: Facts, minReach = 0): Row {
  let chosen: Row | null = null;
  for (const exception of row.exceptions) {
    if (exception.reach < minReach) continue;
    if (!isSubsetOf(exception.facts, known)) continue;
    const better =
      !chosen ||
      factCount(exception.facts) > factCount(chosen.facts) ||
      (factCount(exception.facts) === factCount(chosen.facts) && exception.reach > chosen.reach);
    if (better) chosen = exception;
  }
  return chosen ? speaker(chosen, known, minReach) : row;
}

/** The whole hierarchy: one top row per action the agent has tried, in the order of its actions. */
export function hierarchyOf(mind: Mind): Row[] {
  const roots = rootsOf(mind);
  return mind.actions.flatMap((action) => roots.get(action) ?? []);
}

/** How many rows a hierarchy has, counting exceptions. */
export function rowCount(rows: readonly Row[]): number {
  return rows.reduce((sum, row) => sum + 1 + rowCount(row.exceptions), 0);
}

/** How many different moves the agent has seen. */
export function movesSeen(mind: Mind): number {
  return memoryOf(mind.kb).cases.size;
}

// ---- the parts ------------------------------------------------------------

/**
 * Writes one row per different move to the knowledge base: where and what,
 * followed by the change. The hierarchy is built from those.
 */
export const movesStorage: Storage = {
  store(mind, before, action, next) {
    const known = knownOf(mind, before, action);
    const change = mind.representation.change(before, next);
    const memory = memoryOf(mind.kb);
    // In these worlds the same move always goes the same way. If it ever did
    // not, each way it went is kept as its own case.
    const key = `${factsKey(known)}>${factsKey(change)}`;
    if (!memory.cases.has(key)) {
      memory.cases.set(key, { known, change, changeKey: factsKey(change) });
      memory.roots = null;
    }
    memory.places.set(stateKey(before), before);
    memory.places.set(stateKey(next), next);
    let from = memory.led.get(stateKey(before));
    if (!from) memory.led.set(stateKey(before), (from = new Map()));
    from.set(action, next);
    return [mind.kb.observe(known, change)];
  },
};

export const hierarchyPredictor: Predictor = {
  predict(mind, state, action) {
    const root = rootsOf(mind).get(action);
    if (!root) return null;
    const known = knownOf(mind, state, action);
    const row = speaker(root, known);
    const seen = mind.kb.get(factsKey(known)) !== undefined;
    return {
      state: mind.representation.apply(state, row.change),
      source: seen ? 'specific' : 'general',
      specificity: factCount(row.facts),
      count: row.reach,
      basis: [row.id],
    };
  },
};

/**
 * Planning that tries to break its own guesses. The every-row agent showed that a wrong
 * belief that a move does nothing is never corrected, because no plan goes
 * through it. So this planner plans as if every exception still resting on
 * fewer than `threshold` moves did not apply, except for moves the agent has
 * made itself. The plan is cut off right after the first move that goes
 * against what the agent really expects, so that it sees what happens there
 * and plans again knowing more.
 */
export function throughGuesses(inner: Planner, threshold = 5): Planner {
  return {
    plan(mind, start, goal) {
      const hopeful = (state: State, action: Action) => {
        const root = rootsOf(mind).get(action);
        if (!root) return null;
        const known = knownOf(mind, state, action);
        const made = mind.kb.get(factsKey(known)) !== undefined;
        const row = speaker(root, known, made ? 0 : threshold);
        return {
          state: mind.representation.apply(state, row.change),
          source: made ? ('specific' as const) : ('general' as const),
          specificity: factCount(row.facts),
          count: row.reach,
          basis: [row.id],
        };
      };
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

/**
 * Curiosity that does not run out, and goes looking.
 *
 * A move already made teaches nothing more, so curiosity about it is zero.
 * For any other move it is one divided by the number of different moves the
 * row that speaks for it rests on. That is high for a fresh exception and low
 * for a row that has held many times, but never zero: a row has only been
 * tested where the agent happened to be, so every untried move could still
 * break it.
 *
 * It looks beyond the four moves under its feet. It considers every place it
 * has stood in, picks the most curious untried move, the nearest if several
 * are equal, and walks there along moves it has already made.
 *
 * It is confident only when it has made every move from every place it has
 * stood in. In practice exploring ends when its steps run out.
 */
export function seekUntried(): Explorer {
  const curiosity = (mind: Mind, state: State, action: Action): number => {
    const known = knownOf(mind, state, action);
    if (mind.kb.get(factsKey(known))) return 0;
    const root = rootsOf(mind).get(action);
    if (!root) return 1;
    const reach = speaker(root, known).reach;
    return reach === 0 ? 1 : 1 / reach;
  };

  /** The most curious move at `state`, or null if it has made them all. */
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
        let made = 0;
        for (const from of led.values()) if (from.has(action)) made += 1;
        // Before it has stood anywhere, there is one move to make and none made.
        return { action, seen: made, needed: Math.max(places.size, 1) };
      });
    },

    choose(mind, state) {
      const { places, led } = memoryOf(mind.kb);
      const scores = mind.actions.map((action) => ({ action, curiosity: curiosity(mind, state, action) }));

      // The highest curiosity over every place it has stood in, and here.
      let highest = bestAt(mind, state)?.curiosity ?? 0;
      for (const place of places.values()) highest = Math.max(highest, bestAt(mind, place)?.curiosity ?? 0);

      if (highest === 0) {
        // It has made every move from everywhere it has been.
        return { action: pick(mind.actions, mind.random), curiosity: 0, scores, random: true };
      }

      // Walk outwards along moves already made until a place with such a move is found.
      const wanted = (place: State) => {
        const best = bestAt(mind, place);
        return best && best.curiosity === highest ? best : null;
      };
      const queue: { state: State; first: Action | null }[] = [{ state, first: null }];
      const visited = new Set([stateKey(state)]);
      while (queue.length > 0) {
        const { state: at, first } = queue.shift()!;
        const found = wanted(at);
        if (found) {
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

      // The place cannot be walked back to along moves it has made. Do the best there is here.
      const here = bestAt(mind, state);
      return here
        ? { action: here.action, curiosity: here.curiosity, scores, random: false }
        : { action: pick(mind.actions, mind.random), curiosity: 0, scores, random: true };
    },
  };
}
