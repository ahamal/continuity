import { describe, expect, it } from 'vitest';
import { fromCounts, generalFirst } from '../src/agents/recipes';
import { Grid2D } from '../src/worlds/grid2d';

const fresh = () => generalFirst.build(new Grid2D());

describe('general first', () => {
  it('knows nothing before it has seen anything', () => {
    const agent = fresh();
    expect(agent.predict([4, 4], 'left')).toBeNull();
    expect(agent.curiosity([4, 4], 'left')).toBe(1);
  });

  it('lets a more specific row answer when it has held every time', () => {
    const agent = fresh();
    for (let x = 6; x > 0; x--) agent.observe([x, 4], 'left', [x - 1, 4]);
    for (const y of [1, 2, 3]) agent.observe([0, y], 'left', [0, y]); // the edge, three times

    // "left, x = 0" has never failed, so it answers for the whole edge.
    expect(agent.predict([0, 8], 'left')).toMatchObject({ state: [0, 8], source: 'general' });
    // Away from the edge the general row answers.
    expect(agent.predict([5, 8], 'left')).toMatchObject({ state: [4, 8] });
  });

  it('stops following a row once it has failed', () => {
    const agent = fresh();
    for (let x = 0; x < 4; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    for (const y of [3, 4, 5]) agent.observe([4, y], 'right', [4, y]); // a wall, three bumps

    // "right, x = 4" has held 3 times out of 3. It is a fair guess for the whole column.
    expect(agent.predict([4, 1], 'right')).toMatchObject({ state: [4, 1] });

    // Then the agent gets past at (4, 7). The row has now failed once.
    agent.observe([4, 7], 'right', [5, 7]);
    expect(agent.predict([4, 1], 'right')).toMatchObject({ state: [5, 1] });
    // What it saw at the wall itself still stands.
    expect(agent.predict([4, 4], 'right')).toMatchObject({ state: [4, 4], source: 'specific' });
  });

  it('is where the from-counts agent goes on following the failed row', () => {
    const agent = fromCounts.build(new Grid2D());
    for (let x = 0; x < 4; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    for (const y of [3, 4, 5]) agent.observe([4, y], 'right', [4, y]);
    agent.observe([4, 7], 'right', [5, 7]);

    expect(agent.predict([4, 1], 'right')).toMatchObject({ state: [4, 1] });
  });

  it('between rows equally specific that have both held, lets the better standing answer', () => {
    const agent = fresh();
    for (let x = 0; x < 3; x++) agent.observe([x, 7], 'right', [x + 1, 7]);
    agent.observe([4, 4], 'right', [4, 4]); // one bump

    // At (4, 7): "right, y = 7" has held 3 of 3, "right, x = 4" 1 of 1.
    expect(agent.predict([4, 7], 'right')).toMatchObject({ state: [5, 7] });
  });

  it('starts from the general row that has been right about the most moves', () => {
    const agent = fresh();
    for (let x = 0; x < 6; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    agent.observe([8, 2], 'up', [8, 3]);

    // "x = 8" has only ever gone with moving up, once. "right" has been right six times.
    expect(agent.predict([8, 5], 'right')).toMatchObject({ state: [9, 5] });
  });

  it('answers for a move it has made with what that move did', () => {
    const agent = fresh();
    for (let x = 0; x < 4; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    agent.observe([4, 4], 'right', [4, 4]);

    expect(agent.predict([4, 4], 'right')).toMatchObject({ state: [4, 4], source: 'specific' });
    expect(agent.curiosity([4, 4], 'right')).toBe(0);
  });

  it('is more curious the less sure the row that answers is', () => {
    const agent = fresh();
    agent.observe([0, 0], 'right', [1, 0]);
    const once = agent.curiosity([5, 5], 'right');
    for (let x = 1; x < 6; x++) agent.observe([x, 0], 'right', [x + 1, 0]);
    expect(agent.curiosity([5, 5], 'right')).toBeLessThan(once);
  });
});
