import type { Facts } from '../core/facts';
import type { Entry } from '../core/knowledge-base';
import { type Action, type State, sameState } from '../core/state';
import type { Agent } from './agent';
import type { Prediction } from './parts';

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
  return agent.actions.map((action) => {
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

/** Where the action's general rule alone says it would lead from `state`. */
export function generalExpectation(agent: Agent, state: State, action: Action): State | null {
  const change: Record<string, number> = {};
  for (const name of agent.representation.changeNames) {
    const general = agent.kb.query(name, { action });
    if (general) change[name] = general.value as number;
  }
  if (Object.keys(change).length === 0) return null;
  return agent.representation.apply(state, change);
}

export interface BlockedMove {
  state: State;
  action: Action;
  count: number;
  /** Where the general rule says the action would have led. */
  wouldBe: State | null;
}

/** Every case among `states` where the agent has learned that an action does nothing. */
export function blockedMoves(agent: Agent, states: readonly State[]): BlockedMove[] {
  const found: BlockedMove[] = [];
  for (const state of states) {
    for (const belief of beliefsAt(agent, state)) {
      if (belief.blocked) {
        found.push({
          state,
          action: belief.action,
          count: belief.prediction!.count,
          wouldBe: generalExpectation(agent, state, belief.action),
        });
      }
    }
  }
  return found;
}

/** One question put to the knowledge base, and how it was answered. */
export interface Lookup {
  action: Action;
  /** The facts of the situation: the state as the agent describes it, and the action. */
  question: Facts;
  /** Every stored entry whose inputs are all among those facts. */
  matches: Entry[];
  /** What the agent predicts, with the keys of the entries that answered. */
  prediction: Prediction | null;
}

/** For each action in `state`: which entries apply, and which one answers. */
export function lookupsAt(agent: Agent, state: State): Lookup[] {
  return agent.actions.map((action) => {
    const question = { ...agent.representation.describe(state), action };
    return {
      action,
      question,
      matches: agent.kb.matching(question),
      prediction: agent.predict(state, action),
    };
  });
}
