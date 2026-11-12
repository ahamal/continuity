import { describe, expect, it } from 'vitest';
import { type Row, hierarchyOf, rowCount } from '../src/agents/hierarchy/hierarchy';
import { hierarchy } from '../src/agents/recipes';
import { sameState } from '../src/core/state';
import { findScenario } from '../src/worlds/scenarios';
import { Grid1D } from '../src/worlds/grid1d';
import { Grid2D } from '../src/worlds/grid2d';
import { type GridWorld, openStates } from '../src/worlds/world';

const fresh = () => hierarchy.build(new Grid2D());

/** Every row, with its exceptions after it. */
const flat = (rows: readonly Row[]): Row[] => rows.flatMap((row) => [row, ...flat(row.exceptions)]);

describe('a hierarchy in which every row holds', () => {
  it('knows nothing before it has seen anything', () => {
    const agent = fresh();
    expect(agent.predict([4, 4], 'left')).toBeNull();
    expect(agent.curiosity([4, 4], 'left')).toBe(1);
    expect(hierarchyOf(agent)).toEqual([]);
  });

  it('puts an exception under a row where the row fails, and both then hold', () => {
    const agent = fresh();
    agent.observe([3, 4], 'left', [2, 4]);
    agent.observe([2, 4], 'left', [1, 4]);
    agent.observe([1, 4], 'left', [0, 4]);
    agent.observe([0, 4], 'left', [0, 4]); // the edge

    const [left] = hierarchyOf(agent);
    expect(left).toMatchObject({ facts: { action: 'left' }, change: { dx: -1, dy: 0 }, reach: 3, holds: 3 });
    // x = 0 is in the failure and in none of the successes. y = 4 is in both.
    expect(left!.exceptions).toMatchObject([
      { facts: { action: 'left', x: 0 }, change: { dx: 0, dy: 0 }, reach: 1, holds: 1 },
    ]);
  });

  it('lets the exception speak first, also where the agent has never been', () => {
    const agent = fresh();
    for (let x = 3; x > 0; x--) agent.observe([x, 4], 'left', [x - 1, 4]);
    agent.observe([0, 4], 'left', [0, 4]);

    expect(agent.predict([0, 8], 'left')).toMatchObject({ state: [0, 8], source: 'general' });
    expect(agent.predict([6, 8], 'left')).toMatchObject({ state: [5, 8] });
  });

  it('is not moved by the same bump made again and again', () => {
    const agent = fresh();
    for (let x = 3; x > 0; x--) agent.observe([x, 4], 'left', [x - 1, 4]);
    for (let i = 0; i < 20; i++) agent.observe([0, 4], 'left', [0, 4]);

    const [left] = hierarchyOf(agent);
    expect(left).toMatchObject({ change: { dx: -1, dy: 0 }, reach: 3, holds: 3 });
    expect(left!.exceptions[0]).toMatchObject({ reach: 1, holds: 1 });
    expect(agent.curiosity([0, 4], 'left')).toBe(0);
  });

  it('is curious about an exception it has seen only once, somewhere else', () => {
    const agent = fresh();
    for (let x = 6; x > 0; x--) agent.observe([x, 4], 'left', [x - 1, 4]);
    agent.observe([0, 4], 'left', [0, 4]);

    expect(agent.curiosity([5, 7], 'left')).toBeCloseTo(1 / 6); // the top row rests on six moves
    expect(agent.curiosity([0, 7], 'left')).toBe(1); // the exception rests on one
    expect(agent.curiosity([3, 4], 'left')).toBe(0); // already made
  });

  it('heads for the nearest untried move, along moves it has made', () => {
    const agent = hierarchy.build(new Grid1D());
    for (const pos of [4, 5, 6]) agent.observe([pos], 'right', [pos + 1]);
    for (const pos of [7, 6, 5]) agent.observe([pos], 'left', [pos - 1]);

    // It has stood in 4, 5, 6 and 7. Untried: left at 4 and right at 7. From 5, where it
    // has made both moves, the nearer of the two is at 4.
    expect(agent.chooseExploreAction([5])).toMatchObject({ action: 'left', heading: [4], random: false });
    const there = agent.chooseExploreAction([4]);
    expect(there).toMatchObject({ action: 'left', random: false });
    expect(there.heading).toBeUndefined();
    expect(agent.isConfident()).toBe(false);
  });

  it('drops an exception that turns out to be too wide, and makes a narrower one', () => {
    const agent = fresh();
    for (let x = 0; x < 4; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    agent.observe([4, 4], 'right', [4, 4]); // a wall
    expect(hierarchyOf(agent)[0]!.exceptions).toMatchObject([{ facts: { action: 'right', x: 4 } }]);

    agent.observe([4, 0], 'right', [5, 0]); // right works at x = 4 after all
    agent.observe([7, 4], 'right', [8, 4]); // and at y = 4
    expect(hierarchyOf(agent)[0]!.exceptions).toMatchObject([{ facts: { action: 'right', x: 4, y: 4 } }]);
  });

  it('arrives at the 18 rows written by hand for the walls world, and they predict every move', () => {
    const world = findScenario('2d-walls')!.create() as GridWorld;
    const agent = hierarchy.build(world);
    const moves: { from: number[]; action: string; to: number[] }[] = [];
    for (const from of openStates(world)) {
      for (const action of world.actions) {
        const probe = new Grid2D({ width: 10, height: 10, start: [from[0]!, from[1]!], walls: [[5, 3], [5, 4], [5, 5], [5, 6]] });
        moves.push({ from: [...from], action, to: [...probe.step(action)] });
      }
    }
    for (const move of moves) agent.observe(move.from, move.action, move.to);

    const rows = flat(hierarchyOf(agent));
    expect(rowCount(hierarchyOf(agent))).toBe(18);
    expect(rows.every((row) => row.holds === row.reach)).toBe(true);
    expect(rows.filter((row) => Object.keys(row.facts).length === 1)).toHaveLength(4); // the actions
    expect(rows.filter((row) => Object.keys(row.facts).length === 2)).toHaveLength(4); // the edges
    expect(rows.filter((row) => Object.keys(row.facts).length === 3)).toHaveLength(10); // the sides of the wall
    expect(moves.every((move) => sameState(agent.predict(move.from, move.action)!.state, move.to))).toBe(true);
  });
});
