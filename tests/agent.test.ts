import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agents/agent';
import { searchThenGreedy } from '../src/agents/planning/search-then-greedy';
import { twoLevels } from '../src/agents/recipes';
import { coordinates } from '../src/agents/representations/coordinates';
import {
  countCuriosity,
  specificThenGeneral,
  twoLevelStorage,
} from '../src/agents/two-levels/two-levels';
import { watch } from '../src/runs/drivers';
import { Grid1D } from '../src/worlds/grid1d';
import { Grid2D } from '../src/worlds/grid2d';

const on2D = () => twoLevels.build(new Grid2D());
const on1D = () => twoLevels.build(new Grid1D());

describe('learning', () => {
  it('knows nothing before it has seen anything', () => {
    const agent = on2D();
    expect(agent.predict([4, 4], 'right')).toBeNull();
    expect(agent.curiosity([4, 4], 'right')).toBe(1);
    expect(agent.isConfident()).toBe(false);
  });

  it('carries a general rule over to states it has never visited', () => {
    const agent = on2D();
    agent.observe([4, 4], 'right', [5, 4]);
    expect(agent.predict([0, 7], 'right')).toMatchObject({ state: [1, 7], source: 'general' });
  });

  it('lets what happened in one exact state override the general rule', () => {
    const agent = on2D();
    for (let x = 0; x < 5; x++) agent.observe([x, 4], 'right', [x + 1, 4]);
    agent.observe([9, 4], 'right', [9, 4]); // bumped into the edge

    expect(agent.predict([9, 4], 'right')).toMatchObject({ state: [9, 4], source: 'specific' });
    expect(agent.predict([9, 5], 'right')).toMatchObject({ state: [10, 5], source: 'general' });
  });

  it('learns the same way whether it acts or only watches', () => {
    const world = new Grid1D({ start: 4 });
    const actor = twoLevels.build(world);
    const from = world.getState();
    const to = world.step('right');
    actor.observe(from, 'right', to);

    const watcher = on1D();
    watch(watcher, [{ before: [4], action: 'right', after: [5] }]);

    expect(watcher.predict([7], 'right')).toEqual(actor.predict([7], 'right'));
  });

  it('reports which entries an observation wrote and which a prediction used', () => {
    const agent = on2D();
    const first = agent.observe([4, 4], 'right', [5, 4]);
    expect(first.map((write) => write.createdEntry)).toEqual([true, true, false]);

    const again = agent.observe([4, 5], 'right', [5, 5]);
    expect(again[0]).toMatchObject({ key: first[0]!.key, createdEntry: false });

    expect(agent.predict([0, 0], 'right')!.basis).toEqual([first[0]!.key]);
    expect(agent.predict([4, 4], 'right')!.basis).toEqual([first[1]!.key]);
  });
});

describe('curiosity', () => {
  it('fades as an action is seen more often, then stops', () => {
    const world = new Grid1D();
    const agent = new Agent(world.actions, {
      representation: coordinates(world.stateParts),
      storage: twoLevelStorage,
      predictor: specificThenGeneral,
      explorer: countCuriosity(3),
      planner: searchThenGreedy(),
    });
    expect(agent.curiosity([0], 'right')).toBe(1);
    agent.observe([4], 'right', [5]);
    expect(agent.curiosity([0], 'right')).toBe(1);
    agent.observe([5], 'right', [6]);
    expect(agent.curiosity([0], 'right')).toBe(0.5);
    agent.observe([6], 'right', [7]);
    expect(agent.curiosity([0], 'right')).toBe(0);
    expect(agent.confidence()).toContainEqual({ action: 'right', seen: 3, needed: 3 });
  });

  it('is zero for an exact case already seen', () => {
    const agent = on1D();
    agent.observe([4], 'right', [5]);
    expect(agent.curiosity([4], 'right')).toBe(0);
  });
});
