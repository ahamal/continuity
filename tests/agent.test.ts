import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import type { AgentEvent, ExecuteResult } from '../src/agent/events';
import { blockedMoves } from '../src/agent/inspect';
import { seededRandom } from '../src/agent/random';
import { Grid1D } from '../src/worlds/grid1d';
import { Grid2D } from '../src/worlds/grid2d';
import { findScenario } from '../src/worlds/scenarios';

/** Run a generator to the end, returning what it yielded and what it returned. */
function drain<E, R>(generator: Generator<E, R>): { events: E[]; result: R } {
  const events: E[] = [];
  for (;;) {
    const next = generator.next();
    if (next.done) return { events, result: next.value };
    events.push(next.value);
  }
}

describe('learning', () => {
  it('knows nothing before it has seen anything', () => {
    const agent = new Agent(new Grid2D());
    expect(agent.predict([4, 4], 'right')).toBeNull();
    expect(agent.curiosity([4, 4], 'right')).toBe(1);
    expect(agent.isConfident()).toBe(false);
  });

  it('carries a general rule over to states it has never visited', () => {
    const agent = new Agent(new Grid2D());
    agent.observe([4, 4], 'right', [5, 4]);
    expect(agent.predict([0, 7], 'right')).toMatchObject({ state: [1, 7], source: 'general' });
  });

  it('lets what happened in one exact state override the general rule', () => {
    const agent = new Agent(new Grid2D());
    for (let x = 0; x < 5; x++) agent.observe([x, 4], 'right', [x + 1, 4]);
    agent.observe([9, 4], 'right', [9, 4]); // bumped into the edge

    expect(agent.predict([9, 4], 'right')).toMatchObject({ state: [9, 4], source: 'specific' });
    expect(agent.predict([9, 5], 'right')).toMatchObject({ state: [10, 5], source: 'general' });
  });

  it('learns the same way whether it acts or only watches', () => {
    const actor = new Agent(new Grid1D({ start: 4 }));
    const from = actor.world.getState();
    const to = actor.world.step('right');
    actor.observe(from, 'right', to);

    const watcher = new Agent(new Grid1D({ start: 0 }));
    watcher.observe([4], 'right', [5]);

    expect(watcher.predict([7], 'right')).toEqual(actor.predict([7], 'right'));
  });
});

describe('curiosity', () => {
  it('fades as an action is seen more often, then stops', () => {
    const agent = new Agent(new Grid1D(), { confidenceThreshold: 3 });
    expect(agent.curiosity([0], 'right')).toBe(1);
    agent.observe([4], 'right', [5]);
    expect(agent.curiosity([0], 'right')).toBe(1);
    agent.observe([5], 'right', [6]);
    expect(agent.curiosity([0], 'right')).toBe(0.5);
    agent.observe([6], 'right', [7]);
    expect(agent.curiosity([0], 'right')).toBe(0);
  });

  it('is zero for an exact case already seen', () => {
    const agent = new Agent(new Grid1D());
    agent.observe([4], 'right', [5]);
    expect(agent.curiosity([4], 'right')).toBe(0);
  });

  it('drives exploration until every action is trusted', () => {
    const agent = new Agent(new Grid2D({ width: 10, height: 10 }), { random: seededRandom(1) });
    const { events, result } = drain(agent.explore(100));
    expect(agent.isConfident()).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'confident', steps: result });
    expect(result).toBeGreaterThanOrEqual(20); // four actions, five sightings each
    expect(result).toBeLessThan(100);
  });
});

describe('reaching goals', () => {
  it('plans across states it has never visited', () => {
    const agent = new Agent(new Grid1D({ size: 12, start: 4 }), { random: seededRandom(1) });
    drain(agent.explore());
    const there = drain(agent.executePlan([10])).result;
    const back = drain(agent.executePlan([0])).result;
    expect(there.status).toBe('success');
    expect(back.status).toBe('success');
    expect(agent.world.getState()).toEqual([0]);
  });

  it('reaches every goal in the open 2D grid', () => {
    const scenario = findScenario('2d')!;
    const agent = new Agent(scenario.create(), { random: seededRandom(1) });
    drain(agent.explore(scenario.exploreSteps));
    for (const goal of scenario.goals) {
      expect(drain(agent.executePlan(goal)).result.status).toBe('success');
      expect(agent.world.getState()).toEqual(goal);
    }
  });

  it.each([1, 2, 3, 4, 5])('gets around a wall by being surprised (seed %i)', (seed) => {
    const scenario = findScenario('2d-walls')!;
    const world = scenario.create();
    const agent = new Agent(world, { random: seededRandom(seed) });
    drain(agent.explore(scenario.exploreSteps));

    const run: { events: AgentEvent[]; result: ExecuteResult } = drain(agent.executePlan([8, 4]));
    const surprises = run.events.filter((event) => event.type === 'step' && event.surprise);

    expect(run.result.status).toBe('success');
    expect(world.getState()).toEqual([8, 4]);
    expect(surprises.length).toBeGreaterThan(0);
    expect(blockedMoves(agent, world).length).toBeGreaterThanOrEqual(surprises.length);
  });
});
