import { type Action, type GridWorld, type State, sameState } from '../worlds/world';
import type { Agent, Prediction } from './agent';

/** What the agent believes about one action in one state. */
export interface Belief {
  action: Action;
  prediction: Prediction | null;
  curiosity: number;
  /** True when the agent has seen that this action leaves the state unchanged here. */
  blocked: boolean;
}

/** Ask the agent what it expects from every action in `state`. */
export function beliefsAt(agent: Agent, state: State): Belief[] {
  return agent.world.actions.map((action) => {
    const prediction = agent.predict(state, action);
    return {
      action,
      prediction,
      curiosity: agent.curiosity(state, action),
      blocked:
        prediction !== null &&
        prediction.source === 'specific' &&
        sameState(prediction.state, state),
    };
  });
}

export interface BlockedMove {
  state: State;
  action: Action;
  count: number;
}

/** Every place on the grid where the agent has learned that an action does nothing. */
export function blockedMoves(agent: Agent, grid: GridWorld): BlockedMove[] {
  const found: BlockedMove[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.isWall(x, y)) continue;
      const state = grid.stateAt(x, y);
      for (const belief of beliefsAt(agent, state)) {
        if (belief.blocked) {
          found.push({ state, action: belief.action, count: belief.prediction!.count });
        }
      }
    }
  }
  return found;
}
