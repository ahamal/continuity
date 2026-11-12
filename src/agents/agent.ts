import { KnowledgeBase, type Write } from '../core/knowledge-base';
import type { Random } from '../core/random';
import type { Action, State } from '../core/state';
import type {
  ActionConfidence,
  ExploreChoice,
  Mind,
  Parts,
  Plan,
  Prediction,
  Representation,
} from './parts';

/**
 * An agent that learns how a world behaves and uses that to reach goals.
 *
 * It knows nothing at the start. It does not hold a world: it is handed
 * observations, and asked what it expects, what it wants to try and how it
 * would get somewhere. Something else (see `src/runs`) carries the moves out.
 * That is what lets the same agent learn from moves it only watched.
 */
export class Agent implements Mind {
  readonly kb = new KnowledgeBase();
  readonly representation: Representation;

  constructor(
    readonly actions: readonly Action[],
    private readonly parts: Parts,
    readonly random: Random = Math.random,
  ) {
    this.representation = parts.representation;
  }

  /**
   * Learn from one transition. It makes no difference whether the agent made
   * the move itself or watched it happen. Returns what was written.
   */
  observe(before: State, action: Action, after: State): Write[] {
    return this.parts.storage.store(this, before, action, after);
  }

  /** Predict the state that follows `action` in `state`, or null if nothing is known. */
  predict(state: State, action: Action): Prediction | null {
    return this.parts.predictor.predict(this, state, action);
  }

  curiosity(state: State, action: Action): number {
    return this.parts.explorer.curiosity(this, state, action);
  }

  /** How close each action is to being trusted. */
  confidence(): ActionConfidence[] {
    return this.parts.explorer.confidence(this);
  }

  /** Whether every action has been seen often enough to trust. */
  isConfident(): boolean {
    return this.confidence().every(({ seen, needed }) => seen >= needed);
  }

  /** What to try next in `state` when there is no goal. */
  chooseExploreAction(state: State): ExploreChoice {
    return this.parts.explorer.choose(this, state);
  }

  /** A sequence of actions expected to lead from `start` to `goal`. */
  plan(start: State, goal: State): Plan {
    return this.parts.planner.plan(this, start, goal);
  }
}
