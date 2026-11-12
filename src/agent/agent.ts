import type { Facts } from '../engine/facts';
import { KnowledgeBase } from '../engine/knowledge-base';
import {
  type Action,
  type State,
  type World,
  sameState,
  stateKey,
} from '../worlds/world';
import type {
  ExecuteEvent,
  ExecuteResult,
  ExploreEvent,
  Plan,
} from './events';
import { type Random, pick } from './random';

export interface AgentOptions {
  /** How many times an action must be seen before the agent trusts its general rule. */
  confidenceThreshold?: number;
  /** Source of randomness for exploring. Defaults to `Math.random`. */
  random?: Random;
}

export interface Prediction {
  state: State;
  /** `specific`: this exact state and action was seen. `general`: inferred from the action alone. */
  source: 'specific' | 'general';
  specificity: number;
  count: number;
}

/**
 * An agent that learns how a world behaves and uses that to reach goals.
 *
 * It knows nothing at the start. Every observation is stored at two levels of
 * generality: what the action does in general, and what it did in this exact
 * state. Predictions use the specific level when it exists and fall back to
 * the general one.
 */
export class Agent {
  readonly kb = new KnowledgeBase();
  readonly confidenceThreshold: number;
  private readonly random: Random;

  constructor(
    readonly world: World,
    options: AgentOptions = {},
  ) {
    this.confidenceThreshold = options.confidenceThreshold ?? 5;
    this.random = options.random ?? Math.random;
  }

  /**
   * Learn from one transition. It makes no difference whether the agent made
   * the move itself or watched it happen.
   */
  observe(before: State, action: Action, after: State): void {
    const diff = this.world.computeDiff(before, after);

    // General: what this action does, wherever it is taken.
    this.kb.observe({ action }, diff);

    // Specific: what this action did in this exact state.
    const here = this.inputsFor(before, action);
    this.kb.observe(here, { new_state: after });
    this.kb.observe(here, diff);
  }

  /** Predict the state that follows `action` in `state`, or null if nothing is known. */
  predict(state: State, action: Action): Prediction | null {
    const specific = this.kb.query('new_state', this.inputsFor(state, action));
    if (specific) {
      return {
        state: specific.value as State,
        source: 'specific',
        specificity: specific.specificity,
        count: specific.count,
      };
    }

    const diff: Record<string, number> = {};
    let count = 0;
    for (const name of this.world.diffKeys) {
      const general = this.kb.query(name, { action });
      if (general) {
        diff[name] = general.value as number;
        count = Math.max(count, general.count);
      }
    }
    if (Object.keys(diff).length === 0) return null;

    return {
      state: this.world.applyDiff(state, diff),
      source: 'general',
      specificity: 1,
      count,
    };
  }

  /**
   * How much the agent wants to try `action` in `state`, from 0 to 1.
   * Zero once this exact case has been seen, or once the action's general
   * rule has been seen often enough to trust.
   */
  curiosity(state: State, action: Action): number {
    if (this.kb.query('new_state', this.inputsFor(state, action))) return 0;

    const general = this.generalRule(action);
    if (!general) return 1;
    if (general.count >= this.confidenceThreshold) return 0;
    return 1 / general.count;
  }

  /** How many times the general rule for `action` has been seen. */
  generalCount(action: Action): number {
    return this.generalRule(action)?.count ?? 0;
  }

  /** Whether every action's general rule has been seen often enough to trust. */
  isConfident(): boolean {
    return this.world.actions.every(
      (action) => this.generalCount(action) >= this.confidenceThreshold,
    );
  }

  pickCuriousAction(state: State): { action: Action; curiosity: number } {
    let best: Action = this.world.actions[0]!;
    let bestCuriosity = -1;
    for (const action of this.world.actions) {
      const value = this.curiosity(state, action);
      if (value > bestCuriosity) {
        bestCuriosity = value;
        best = action;
      }
    }
    return { action: best, curiosity: bestCuriosity };
  }

  /**
   * Find a sequence of actions from `start` to `goal` by chaining predictions.
   * Searches breadth-first, then falls back to moving greedily closer.
   */
  plan(start: State, goal: State, maxSteps = 100): Plan {
    if (sameState(start, goal)) return { path: [], status: 'success' };

    const queue: { state: State; path: Action[] }[] = [{ state: start, path: [] }];
    const visited = new Set([stateKey(start)]);

    while (queue.length > 0 && visited.size < maxSteps) {
      const { state, path } = queue.shift()!;

      for (const action of this.world.actions) {
        const prediction = this.predict(state, action);
        if (!prediction) continue;

        const next = prediction.state;
        if (visited.has(stateKey(next))) continue;

        const nextPath = [...path, action];
        if (sameState(next, goal)) return { path: nextPath, status: 'success' };

        visited.add(stateKey(next));
        queue.push({ state: next, path: nextPath });
      }
    }

    return this.greedyPlan(start, goal);
  }

  /** Explore out of curiosity until confident. Returns the number of steps taken. */
  *explore(maxSteps = 50): Generator<ExploreEvent, number> {
    for (let index = 0; index < maxSteps; index++) {
      if (this.isConfident()) {
        yield { type: 'confident', steps: index };
        return index;
      }

      const from = this.world.getState();
      let { action, curiosity } = this.pickCuriousAction(from);
      if (curiosity === 0) {
        // Nothing here is interesting. Move at random to find something that is.
        action = pick(this.world.actions, this.random);
      }

      const to = this.world.step(action);
      this.observe(from, action, to);
      yield { type: 'explore-step', index, from, action, to, curiosity };
    }

    yield { type: 'explore-exhausted', steps: maxSteps };
    return maxSteps;
  }

  /**
   * Plan a route to `goal` and follow it. When a step turns out differently
   * from the prediction, learn from it and plan again.
   */
  *executePlan(goal: State, maxReplans = 10): Generator<ExecuteEvent, ExecuteResult> {
    yield { type: 'goal', goal };
    let steps = 0;

    for (let attempt = 0; attempt < maxReplans; attempt++) {
      const current = this.world.getState();
      if (sameState(current, goal)) {
        yield { type: 'reached', steps };
        return { steps, status: 'success' };
      }

      const { path, status } = this.plan(current, goal);
      yield { type: 'plan', from: current, path, status };
      if (path.length === 0) {
        yield { type: 'no-path' };
        return { steps, status: 'no path' };
      }

      for (const action of path) {
        const from = this.world.getState();
        const expected = this.predict(from, action)?.state ?? null;

        const to = this.world.step(action);
        steps += 1;

        const surprise = expected !== null && !sameState(to, expected);
        this.observe(from, action, to);
        yield { type: 'step', from, action, to, expected, surprise };

        if (surprise) break; // The plan rested on a wrong belief. Plan again.

        if (sameState(to, goal)) {
          yield { type: 'reached', steps };
          return { steps, status: 'success' };
        }
      }
    }

    yield { type: 'max-replans' };
    return { steps, status: 'max replans' };
  }

  private inputsFor(state: State, action: Action): Facts {
    return { ...this.world.describe(state), action };
  }

  private generalRule(action: Action) {
    return this.kb.query(this.world.diffKeys[0]!, { action });
  }

  private greedyPlan(start: State, goal: State, maxSteps = 50): Plan {
    const path: Action[] = [];
    const visited = new Set<string>();
    let state = start;

    for (let i = 0; i < maxSteps; i++) {
      if (sameState(state, goal)) return { path, status: 'success' };
      if (visited.has(stateKey(state))) return { path, status: 'stuck in loop' };
      visited.add(stateKey(state));

      let bestAction: Action | null = null;
      let bestState: State = state;
      let bestDistance = this.world.distance(state, goal);

      for (const action of this.world.actions) {
        const prediction = this.predict(state, action);
        if (!prediction) continue;
        const distance = this.world.distance(prediction.state, goal);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAction = action;
          bestState = prediction.state;
        }
      }

      if (bestAction === null) return { path, status: 'no improving action' };
      path.push(bestAction);
      state = bestState;
    }

    return { path, status: 'max steps reached' };
  }
}
