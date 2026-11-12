import { describe, expect, it } from 'vitest';
import { blockedMoves } from '../src/agents/inspect';
import { everyRow, fromCounts, generalFirst, hierarchy, twoLevels } from '../src/agents/recipes';
import { bench } from '../src/runs/bench';
import { routes } from '../src/runs/routes';
import { Run, replay } from '../src/runs/run';
import { summarise } from '../src/runs/summary';
import { findScenario } from '../src/worlds/scenarios';
import { type GridWorld, openStates } from '../src/worlds/world';

const start = (id: string, seed = 1) =>
  new Run({ recipe: twoLevels, scenario: findScenario(id)!, seed });

describe('exploring', () => {
  it('goes on until every action is trusted', () => {
    const run = start('2d');
    run.do({ type: 'explore' });
    const summary = summarise(run.events);

    expect(run.agent.isConfident()).toBe(true);
    expect(run.events.at(-1)).toEqual({ type: 'confident', steps: summary.exploreSteps });
    expect(summary.exploreSteps).toBeGreaterThanOrEqual(20); // four actions, five sightings each
    expect(summary.exploreSteps).toBeLessThan(100);
    expect(summary.mode).toMatchObject({ kind: 'explored', confident: true });
  });

  it('records why each move was chosen', () => {
    const run = start('2d');
    run.do({ type: 'explore' });
    const first = summarise(run.events).steps[0]!;
    expect(first.choice).toMatchObject({ curiosity: 1, random: false });
    expect(first.choice!.scores).toHaveLength(4);
    expect(first.expected).toBeNull();
  });
});

describe('reaching goals', () => {
  it('plans across states it has never visited', () => {
    const run = start('1d');
    run.do({ type: 'explore' });
    run.do({ type: 'goal', goal: [10] });
    run.do({ type: 'goal', goal: [0] });
    expect(run.events.filter((event) => event.type === 'reached')).toHaveLength(2);
    expect(run.world.getState()).toEqual([0]);
  });

  it.each([1, 2, 3, 4, 5])('gets around a wall by being surprised (seed %i)', (seed) => {
    const run = start('2d-walls', seed);
    run.do({ type: 'explore' });
    run.do({ type: 'goal', goal: [8, 4] });
    const summary = summarise(run.events);

    expect(summary.mode.kind).toBe('reached');
    expect(run.world.getState()).toEqual([8, 4]);
    expect(summary.surprises.goal).toBeGreaterThan(0);
    expect(
      blockedMoves(run.agent, openStates(run.world as GridWorld)).length,
    ).toBeGreaterThanOrEqual(summary.surprises.goal);
  });
});

describe('replay', () => {
  it('rebuilds a run exactly, up to any point', () => {
    const run = start('2d-walls', 3);
    run.do({ type: 'explore' });
    run.do({ type: 'goal', goal: [8, 4] });

    for (const upTo of [0, 1, 7, 25, run.events.length]) {
      const copy = replay(run.config, run.script, upTo);
      expect(copy.events).toEqual(run.events.slice(0, upTo));
    }
  });

  it('leaves a cut-off command under way, so the copy can carry on', () => {
    const run = start('2d', 2);
    run.do({ type: 'explore' });

    const copy = replay(run.config, run.script, 5);
    expect(copy.busy).toBe(true);
    copy.finish();
    expect(copy.events).toEqual(run.events);
    expect(copy.agent.kb.entries()).toEqual(run.agent.kb.entries());
  });
});

// These numbers describe how each stage behaves. They must not change when
// later stages are added. If one changes, an earlier stage has been altered.
describe('pinned results', () => {
  it('two levels, seeds 1 to 500', () => {
    const solved = (id: string) => bench(twoLevels, findScenario(id)!, 500).solved;
    expect(solved('1d')).toBe(500);
    expect(solved('2d')).toBe(500);
    expect(solved('2d-walls')).toBe(367);
  });

  it('every row has a say, seeds 1 to 500', () => {
    const solved = (id: string) => bench(everyRow, findScenario(id)!, 500).solved;
    expect(solved('1d')).toBe(500);
    expect(solved('2d')).toBe(131);
    expect(solved('2d-walls')).toBe(59);
  }, 60_000);

  it('read from the counts, seeds 1 to 500', () => {
    const solved = (id: string) => bench(fromCounts, findScenario(id)!, 500).solved;
    expect(solved('1d')).toBe(500);
    expect(solved('2d')).toBe(500);
    expect(solved('2d-walls')).toBe(500);
  }, 120_000);

  it('every row holds (built by hand), seeds 1 to 500', () => {
    const solved = (id: string) => bench(hierarchy, findScenario(id)!, 500).solved;
    expect(solved('1d')).toBe(500);
    expect(solved('2d')).toBe(500);
    expect(solved('2d-walls')).toBe(500);
  }, 60_000);

  it('general first, seeds 1 to 500', () => {
    const solved = (id: string) => bench(generalFirst, findScenario(id)!, 500).solved;
    expect(solved('1d')).toBe(500);
    expect(solved('2d')).toBe(500);
    expect(solved('2d-walls')).toBe(500);
  }, 120_000);

  // Ten trips to cells picked at random, in each of 50 runs, compared with the
  // shortest route for each trip.
  it('routes on the grid with a wall', () => {
    const walls = findScenario('2d-walls')!;
    expect(routes(twoLevels, walls, 50)).toMatchObject({ trips: 500, reached: 482, moves: 3383, shortest: 3166 });
    expect(routes(everyRow, walls, 50)).toMatchObject({ trips: 500, reached: 265, moves: 1708, shortest: 1497 });
    expect(routes(fromCounts, walls, 50)).toMatchObject({ trips: 500, reached: 494, moves: 3980, shortest: 3455 });
    expect(routes(generalFirst, walls, 50)).toMatchObject({ trips: 500, reached: 500, moves: 3813, shortest: 3532 });
  }, 60_000);

  it('routes on the open grid', () => {
    const open = findScenario('2d')!;
    expect(routes(fromCounts, open, 50)).toMatchObject({ reached: 500, shortestTaken: 499 });
    expect(routes(generalFirst, open, 50)).toMatchObject({ reached: 500, shortestTaken: 500 });
  }, 60_000);
});
