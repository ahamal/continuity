import { Grid1D } from './grid1d';
import { Grid2D } from './grid2d';
import type { GridWorld, State } from './world';

/** A ready-made world with a set of goals to try in it. */
export interface Scenario {
  id: string;
  label: string;
  description: string;
  /** Build a fresh copy of the world. */
  create(): GridWorld;
  /** The most steps the agent may spend exploring. */
  exploreSteps: number;
  goals: State[];
}

export const scenarios: Scenario[] = [
  {
    id: '1d',
    label: '1D line',
    description: 'Twelve cells in a row. The agent can move left or right.',
    create: () => new Grid1D({ size: 12, start: 4 }),
    exploreSteps: 50,
    goals: [[10], [0]],
  },
  {
    id: '2d',
    label: '2D grid',
    description: 'A ten by ten grid with nothing in the way.',
    create: () => new Grid2D({ width: 10, height: 10, start: [4, 4] }),
    exploreSteps: 100,
    goals: [
      [9, 9],
      [0, 0],
      [9, 0],
    ],
  },
  {
    id: '2d-walls',
    label: '2D grid with walls',
    description: 'A ten by ten grid with a wall between the agent and its goal.',
    create: () =>
      new Grid2D({
        width: 10,
        height: 10,
        start: [2, 4],
        walls: [
          [5, 3],
          [5, 4],
          [5, 5],
          [5, 6],
        ],
      }),
    exploreSteps: 100,
    goals: [[8, 4]],
  },
];

export function findScenario(id: string): Scenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}
