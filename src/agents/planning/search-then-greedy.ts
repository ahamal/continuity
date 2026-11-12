import { type Action, type State, sameState, stateKey } from '../../core/state';
import type { Mind, Plan, Planner } from '../parts';

export interface SearchOptions {
  /** The search stops once it has seen this many states. */
  maxVisited?: number;
  /** The most steps the greedy fallback may take. */
  maxGreedySteps?: number;
}

/**
 * Search breadth-first through predicted states, each
 * prediction built on the one before. If the search gives up, step toward the
 * goal greedily instead.
 */
export function searchThenGreedy(options: SearchOptions = {}): Planner {
  const maxVisited = options.maxVisited ?? 100;
  const maxGreedySteps = options.maxGreedySteps ?? 50;

  return {
    plan(mind, start, goal) {
      if (sameState(start, goal)) return { path: [], status: 'success', method: 'none' };

      const queue: { state: State; path: Action[] }[] = [{ state: start, path: [] }];
      const visited = new Set([stateKey(start)]);

      while (queue.length > 0 && visited.size < maxVisited) {
        const { state, path } = queue.shift()!;

        for (const action of mind.actions) {
          const prediction = mind.predict(state, action);
          if (!prediction) continue;

          const next = prediction.state;
          if (visited.has(stateKey(next))) continue;

          const nextPath = [...path, action];
          if (sameState(next, goal)) return { path: nextPath, status: 'success', method: 'search' };

          visited.add(stateKey(next));
          queue.push({ state: next, path: nextPath });
        }
      }

      return greedy(mind, start, goal, maxGreedySteps);
    },
  };
}

function greedy(mind: Mind, start: State, goal: State, maxSteps: number): Plan {
  const path: Action[] = [];
  const visited = new Set<string>();
  let state = start;

  for (let i = 0; i < maxSteps; i++) {
    if (sameState(state, goal)) return { path, status: 'success', method: 'greedy' };
    if (visited.has(stateKey(state))) return { path, status: 'stuck in loop', method: 'greedy' };
    visited.add(stateKey(state));

    let bestAction: Action | null = null;
    let bestState: State = state;
    let bestDistance = mind.representation.distance(state, goal);

    for (const action of mind.actions) {
      const prediction = mind.predict(state, action);
      if (!prediction) continue;
      const distance = mind.representation.distance(prediction.state, goal);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestAction = action;
        bestState = prediction.state;
      }
    }

    if (bestAction === null) return { path, status: 'no improving action', method: 'greedy' };
    path.push(bestAction);
    state = bestState;
  }

  return { path, status: 'max steps reached', method: 'greedy' };
}
