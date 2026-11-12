import { describe, expect, it } from 'vitest';
import { type ReadRow, readHierarchy } from '../src/agents/from-counts/from-counts';
import { fromCounts } from '../src/agents/recipes';
import { sameState } from '../src/core/state';
import { findScenario } from '../src/worlds/scenarios';
import { Grid2D } from '../src/worlds/grid2d';
import { type GridWorld, openStates } from '../src/worlds/world';

const fresh = () => fromCounts.build(new Grid2D());

describe('a hierarchy read from the counts', () => {
  it('knows nothing before it has seen anything', () => {
    const agent = fresh();
    expect(agent.predict([4, 4], 'left')).toBeNull();
    expect(agent.curiosity([4, 4], 'left')).toBe(1);
    expect(readHierarchy(agent)).toEqual([]);
  });

  it('counts a move once, however often it is made', () => {
    const agent = fresh();
    expect(agent.observe([0, 4], 'left', [0, 4])).toHaveLength(127);
    expect(agent.observe([0, 4], 'left', [0, 4])).toEqual([]);
  });

  it('falls down to the most specific row that applies', () => {
    const agent = fresh();
    for (let x = 6; x > 0; x--) agent.observe([x, 4], 'left', [x - 1, 4]);
    agent.observe([0, 4], 'left', [0, 4]); // the edge

    // At (0, 8) "left, x = 0" applies and is more specific than "left".
    expect(agent.predict([0, 8], 'left')).toMatchObject({ state: [0, 8], source: 'general' });
    expect(agent.predict([5, 8], 'left')).toMatchObject({ state: [4, 8] });
  });

  it('between rows equally specific, lets the better standing speak', () => {
    const agent = fresh();
    for (let x = 6; x > 0; x--) agent.observe([x, 4], 'left', [x - 1, 4]);
    for (const y of [1, 2, 3]) agent.observe([0, y], 'left', [0, y]); // the edge, three times
    agent.observe([3, 8], 'left', [2, 8]);

    // At (0, 8): "left, x = 0" has held 3 of 3, "left, y = 8" 1 of 1. Both have two facts.
    expect(agent.predict([0, 8], 'left')).toMatchObject({ state: [0, 8] });
  });

  it('treats a specific row seen once as a guess: it speaks, and the agent is curious about it', () => {
    const agent = fresh();
    for (let x = 5; x < 9; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    agent.observe([4, 4], 'up', [4, 5]);

    // "x = 4, y = 4" has only ever gone with moving up. It is more specific than "right",
    // so it speaks, wrongly. It has been seen once, so the agent is as curious as it gets
    // about a row that exists, and trying the move will correct it.
    expect(agent.predict([4, 4], 'right')).toMatchObject({ state: [4, 5] });
    expect(agent.curiosity([4, 4], 'right')).toBeCloseTo(1 / 2);
    agent.observe([4, 4], 'right', [5, 4]);
    expect(agent.predict([4, 4], 'right')).toMatchObject({ state: [5, 4], source: 'specific' });
  });

  it('is more curious the less sure the row that speaks is', () => {
    const agent = fresh();
    agent.observe([0, 4], 'right', [1, 4]);
    expect(agent.curiosity([6, 6], 'right')).toBeCloseTo(1 / 2); // held 1 of 1: standing 1/2
    for (let x = 1; x < 4; x++) agent.observe([x, 4], 'right', [x + 1, 4]);
    expect(agent.curiosity([6, 6], 'right')).toBeCloseTo(1 / 5); // held 4 of 4: standing 4/5
    expect(agent.curiosity([0, 4], 'right')).toBe(0); // already made
  });

  it('supports the 18 rows written by hand, with the actions at the top unasked', () => {
    const world = findScenario('2d-walls')!.create() as GridWorld;
    const agent = fromCounts.build(world);
    const moves: { from: number[]; action: string; to: number[] }[] = [];
    for (const from of openStates(world)) {
      for (const action of world.actions) {
        const probe = new Grid2D({ width: 10, height: 10, start: [from[0]!, from[1]!], walls: [[5, 3], [5, 4], [5, 5], [5, 6]] });
        moves.push({ from: [...from], action, to: [...probe.step(action)] });
      }
    }
    for (const move of moves) agent.observe(move.from, move.action, move.to);

    expect(moves.every((move) => sameState(agent.predict(move.from, move.action)!.state, move.to))).toBe(true);

    // Top rows are ordered by how many moves each speaks for itself. Nothing puts the
    // action first, and the four action rows come first all the same.
    const rows = readHierarchy(agent);
    const top = rows.slice(0, 4);
    expect(top.map((row) => Object.keys(row.facts))).toEqual([['action'], ['action'], ['action'], ['action']]);
    expect(top.every((row) => row.holds === row.reach)).toBe(true);

    const count = (list: readonly ReadRow[]): number => list.reduce((sum, row) => sum + 1 + count(row.exceptions), 0);
    expect(count(top)).toBe(18);
    const exceptions = top.flatMap((row) => row.exceptions);
    expect(exceptions.filter((row) => Object.keys(row.facts).length === 2)).toHaveLength(4); // the edges
    expect(exceptions.filter((row) => Object.keys(row.facts).length === 3)).toHaveLength(10); // the sides of the wall

    // A row about a place, such as "x = 0", can be made to hold too, but only with many more exceptions.
    expect(rows[4]!.exceptions.length).toBeGreaterThan(15);
  });
});
