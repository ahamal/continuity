import type { Agent } from '../agents/agent';
import { type Action, type State, sameState } from '../core/state';
import type { World } from '../worlds/world';
import type { RunEvent } from './events';

// Drivers connect an agent to a world. The agent decides and learns, the
// driver carries moves out and reports what happened. Each driver is a
// generator, so a caller can take one event at a time.

/** Let the agent act out of curiosity until it is confident or out of steps. */
export function* explore(agent: Agent, world: World, maxSteps: number): Generator<RunEvent> {
  yield { type: 'explore', maxSteps };

  for (let index = 0; index < maxSteps; index++) {
    if (agent.isConfident()) {
      yield { type: 'confident', steps: index };
      return;
    }

    const from = world.getState();
    const choice = agent.chooseExploreAction(from);
    const expected = agent.predict(from, choice.action);

    const to = world.step(choice.action);
    const writes = agent.observe(from, choice.action, to);

    yield {
      type: 'step',
      phase: 'explore',
      from,
      action: choice.action,
      to,
      expected,
      surprise: expected !== null && !sameState(to, expected.state),
      writes,
      confidence: agent.confidence(),
      choice,
    };
  }

  yield { type: 'explore-exhausted', steps: maxSteps };
}

/**
 * Have the agent plan a route to `goal` and follow it. When a move turns out
 * differently from the prediction, the agent learns from it and plans again.
 */
export function* pursue(
  agent: Agent,
  world: World,
  goal: State,
  maxReplans = 10,
): Generator<RunEvent> {
  yield { type: 'goal', goal };
  let steps = 0;

  for (let attempt = 1; attempt <= maxReplans; attempt++) {
    const current = world.getState();
    if (sameState(current, goal)) {
      yield { type: 'reached', goal, steps };
      return;
    }

    const plan = agent.plan(current, goal);
    yield { type: 'plan', from: current, goal, states: expectedStates(agent, current, plan.path), attempt, ...plan };
    if (plan.path.length === 0) {
      yield { type: 'no-path', goal, steps };
      return;
    }

    for (let i = 0; i < plan.path.length; i++) {
      const action = plan.path[i]!;
      const from = world.getState();
      const expected = agent.predict(from, action);

      const to = world.step(action);
      steps += 1;

      const surprise = expected !== null && !sameState(to, expected.state);
      const writes = agent.observe(from, action, to);

      yield {
        type: 'step',
        phase: 'goal',
        from,
        action,
        to,
        expected,
        surprise,
        writes,
        confidence: agent.confidence(),
        planStep: { index: i + 1, of: plan.path.length },
        goal,
      };

      if (surprise) break; // The plan rested on a wrong belief. Plan again.

      if (sameState(to, goal)) {
        yield { type: 'reached', goal, steps };
        return;
      }
    }
  }

  yield { type: 'max-replans', goal, steps };
}

/** A move that happened, whoever made it. */
export interface Transition {
  before: State;
  action: Action;
  after: State;
}

/** Let the agent learn from moves it did not make. */
export function watch(agent: Agent, transitions: Iterable<Transition>): void {
  for (const { before, action, after } of transitions) agent.observe(before, action, after);
}

/** The states the agent expects a path to pass through, one per action. */
function expectedStates(agent: Agent, start: State, path: readonly Action[]): State[] {
  const states: State[] = [];
  let state = start;
  for (const action of path) {
    const prediction = agent.predict(state, action);
    if (!prediction) break;
    state = prediction.state;
    states.push(state);
  }
  return states;
}
