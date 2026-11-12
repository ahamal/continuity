import { describe, expect, it } from 'vitest';
import { timesSeen } from '../src/agents/every-combination/every-combination';
import { everyCombination, twoLevels } from '../src/agents/recipes';
import { factsKey } from '../src/core/facts';
import type { Recipe } from '../src/agents/recipes';
import { Run } from '../src/runs/run';
import { findScenario } from '../src/worlds/scenarios';
import { Grid1D } from '../src/worlds/grid1d';
import { Grid2D } from '../src/worlds/grid2d';

describe('every combination', () => {
  it('writes one row for each combination of the facts of a move', () => {
    const line = everyCombination.build(new Grid1D());
    line.observe([4], 'right', [5]); // action, pos, pos1, dx
    expect(line.kb.size).toBe(15);

    const grid = everyCombination.build(new Grid2D());
    const writes = grid.observe([4, 4], 'right', [5, 4]); // action, x, y, x1, y1, dx, dy
    expect(writes).toHaveLength(127);
    expect(grid.kb.size).toBe(127);
  });

  it('counts how often the facts of a row were seen together', () => {
    const agent = everyCombination.build(new Grid2D());
    agent.observe([4, 4], 'right', [5, 4]);
    agent.observe([5, 4], 'right', [6, 4]);
    agent.observe([9, 4], 'right', [9, 4]); // the edge

    const seen = (facts: Record<string, string | number>) => {
      const entry = agent.kb.get(factsKey(facts));
      return entry ? timesSeen(entry) : 0;
    };
    expect(seen({ action: 'right' })).toBe(3);
    expect(seen({ action: 'right', dx: 1 })).toBe(2);
    expect(seen({ action: 'right', dx: 0 })).toBe(1);
    expect(seen({ action: 'right', x: 9, dx: 0 })).toBe(1);
    expect(seen({ y: 4, y1: 4 })).toBe(3);
    expect(seen({ x: 5 })).toBe(1);
    expect(seen({ x1: 5 })).toBe(1);
  });

  it('predicts as stages 3 to 5 do', () => {
    const agent = everyCombination.build(new Grid2D());
    expect(agent.predict([4, 4], 'right')).toBeNull();
    for (let x = 0; x < 5; x++) agent.observe([x, 4], 'right', [x + 1, 4]);
    agent.observe([9, 4], 'right', [9, 4]);

    expect(agent.predict([9, 4], 'right')).toMatchObject({ state: [9, 4], source: 'specific' });
    expect(agent.predict([9, 5], 'right')).toMatchObject({ state: [10, 5], source: 'general', count: 5 });
  });

  it('acts exactly as the two-level agent does: only what is stored differs', () => {
    const moves = (recipe: Recipe, id: string, seed: number) => {
      const scenario = findScenario(id)!;
      const run = new Run({ recipe, scenario, seed });
      run.do({ type: 'explore' });
      for (const goal of scenario.goals) run.do({ type: 'goal', goal });
      return run.events.map((event) =>
        event.type === 'step'
          ? [event.phase, event.from, event.action, event.to, event.surprise]
          : event.type === 'plan'
            ? [event.type, event.path, event.method]
            : [event.type],
      );
    };

    for (const id of ['1d', '2d', '2d-walls']) {
      for (const seed of [1, 2, 3, 7, 11]) {
        expect(moves(everyCombination, id, seed)).toEqual(moves(twoLevels, id, seed));
      }
    }
  });
});
