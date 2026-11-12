import { describe, expect, it } from 'vitest';
import { everyRow } from '../src/agents/recipes';
import { Grid2D } from '../src/worlds/grid2d';

const fresh = () => everyRow.build(new Grid2D());

describe('every row has a say', () => {
  it('knows nothing before it has seen anything', () => {
    const agent = fresh();
    expect(agent.predict([4, 4], 'right')).toBeNull();
    expect(agent.curiosity([4, 4], 'right')).toBe(1);
  });

  it('carries an edge over to cells it has never been in, from one bump', () => {
    const agent = fresh();
    for (let x = 0; x < 5; x++) agent.observe([x, 4], 'right', [x + 1, 4]);
    agent.observe([9, 2], 'right', [9, 2]); // one bump into the edge

    // "action = right, x = 9" has always gone with dx = 0. "action = right" alone has not.
    expect(agent.predict([9, 6], 'right')).toMatchObject({ state: [9, 6], source: 'general' });
    expect(agent.predict([7, 6], 'right')).toMatchObject({ state: [8, 6] });
  });

  it('also believes rows that have nothing to do with the action', () => {
    const agent = fresh();
    for (let x = 5; x < 9; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    agent.observe([4, 4], 'up', [4, 5]);

    // At (4, 4) it has only ever seen dx = 0 and dy = +1, so it expects that of any action.
    expect(agent.predict([4, 4], 'right')).toMatchObject({ state: [4, 5] });
  });

  it('drops such a belief once it is seen to fail', () => {
    const agent = fresh();
    for (let x = 5; x < 9; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    agent.observe([4, 4], 'up', [4, 5]);
    agent.observe([4, 4], 'right', [5, 4]);

    expect(agent.predict([4, 4], 'right')).toMatchObject({ state: [5, 4], source: 'specific' });
  });

  it('is curious about a move until some row that agrees with its answer has held five times', () => {
    const agent = fresh();
    agent.observe([0, 4], 'right', [1, 4]);
    expect(agent.curiosity([6, 6], 'right')).toBe(1);
    agent.observe([1, 4], 'right', [2, 4]);
    expect(agent.curiosity([6, 6], 'right')).toBe(0.5);
    for (let x = 2; x < 5; x++) agent.observe([x, 4], 'right', [x + 1, 4]);
    expect(agent.curiosity([6, 6], 'right')).toBe(0);
    expect(agent.confidence()).toContainEqual({ action: 'right', seen: 5, needed: 5 });
  });
});
