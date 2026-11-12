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

/**
 * Every case among `states` where the agent expects an action to do nothing,
 * whichever row that expectation comes from. `blockedMoves` reports only cases
 * the agent has seen for itself. This also reports the ones it has carried
 * over from elsewhere, right or wrong.
 */
export function expectedStays(agent: Agent, states: readonly State[]): BlockedMove[] {
  const found: BlockedMove[] = [];
  for (const action of agent.actions) {
    // Where the action usually leads: its most common predicted change that is not "none".
    const tally = new Map<string, { change: number[]; count: number }>();
    const stays: { state: State; count: number }[] = [];
    for (const state of states) {
      const prediction = agent.predict(state, action);
      if (!prediction) continue;
      if (sameState(prediction.state, state)) {
        stays.push({ state, count: prediction.count });
        continue;
      }
      const change = prediction.state.map((value, i) => value - state[i]!);
      const key = change.join(',');
      const entry = tally.get(key) ?? { change, count: 0 };
      entry.count += 1;
      tally.set(key, entry);
    }
    let usual: number[] | null = null;
    let most = 0;
    for (const { change, count } of tally.values()) {
      if (count > most) [usual, most] = [change, count];
    }
    for (const { state, count } of stays) {
      found.push({ state, action, count, wouldBe: usual && state.map((value, i) => value + usual![i]!) });
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
