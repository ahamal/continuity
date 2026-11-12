import type { Facts } from '../core/facts';
import type { KnowledgeBase, Write } from '../core/knowledge-base';
import type { Random } from '../core/random';
import type { Action, State } from '../core/state';

// An agent is put together from five parts. Each part is one decision about
// how the agent works. A stage of the project is a named choice of parts (see
// recipes.ts). To try a new idea, add a new part beside the old one and make a
// new recipe. Parts that an earlier stage uses are never edited.

/** How a state becomes facts, and how a change is measured and applied. */
export interface Representation {
  /** Names of the facts that report a change, such as `['dx', 'dy']`. */
  readonly changeNames: readonly string[];
  /** Name the parts of a state as facts, for example `[4, 4]` → `{ x: 4, y: 4 }`. */
  describe(state: State): Facts;
  /** What changed between two states, as facts. */
  change(before: State, after: State): Facts;
  /** The state reached by applying a change to a state. */
  apply(state: State, change: Facts): State;
  distance(a: State, b: State): number;
}

/** What the agent expects to follow an action, and what that rests on. */
export interface Prediction {
  state: State;
  /** `specific`: this exact state and action was seen. `general`: inferred from a wider rule. */
  source: 'specific' | 'general';
  /** How many input facts the answering entry has. */
  specificity: number;
  /** How many times the answering outcome was seen. */
  count: number;
  /** Keys of the knowledge base entries the prediction came from. */
  basis: string[];
}

/** The agent's choice of what to try next while exploring. */
export interface ExploreChoice {
  action: Action;
  /** Curiosity about the chosen action before taking it. */
  curiosity: number;
  /** Curiosity about every action in this state. */
  scores: { action: Action; curiosity: number }[];
  /** True when nothing here was interesting and the action was picked at random. */
  random: boolean;
}

/** How far the agent is from trusting what it knows about one action. */
export interface ActionConfidence {
  action: Action;
  /** How many times the action's general rule has been seen. */
  seen: number;
  /** How many sightings it takes to trust it. */
  needed: number;
}

export type PlanStatus =
  | 'success'
  | 'stuck in loop'
  | 'no improving action'
  | 'max steps reached';

export interface Plan {
  path: Action[];
  status: PlanStatus;
  /** `search`: found by searching predictions. `greedy`: the search gave up. */
  method: 'search' | 'greedy' | 'none';
}

/** What the parts can see of the agent they belong to. */
export interface Mind {
  readonly kb: KnowledgeBase;
  readonly actions: readonly Action[];
  readonly representation: Representation;
  readonly random: Random;
  predict(state: State, action: Action): Prediction | null;
  curiosity(state: State, action: Action): number;
}

/** Which entries one observation is written to. */
export interface Storage {
  store(mind: Mind, before: State, action: Action, after: State): Write[];
}

export interface Predictor {
  predict(mind: Mind, state: State, action: Action): Prediction | null;
}

export interface Explorer {
  /** How much the agent wants to try `action` in `state`, from 0 to 1. */
  curiosity(mind: Mind, state: State, action: Action): number;
  confidence(mind: Mind): ActionConfidence[];
  choose(mind: Mind, state: State): ExploreChoice;
}

export interface Planner {
  plan(mind: Mind, start: State, goal: State): Plan;
}

export interface Parts {
  representation: Representation;
  storage: Storage;
  predictor: Predictor;
  explorer: Explorer;
  planner: Planner;
}
