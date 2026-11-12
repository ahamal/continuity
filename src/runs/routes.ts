import type { Recipe } from '../agents/recipes';
import { pick, seededRandom } from '../core/random';
import { type State, sameState } from '../core/state';
import type { Scenario } from '../worlds/scenarios';
import { type GridWorld, isGridWorld, openStates } from '../worlds/world';
import { Run } from './run';

// How good are the routes an agent takes? The standard test (`bench`) only asks
// whether a goal was reached. This one sends the agent on a series of trips to
// cells picked at random and compares each trip with the shortest there is.
// The goals differ from seed to seed even when an agent's exploring does not.

export interface RouteRow {
  recipe: string;
  scenario: string;
  seeds: number;
  /** Trips asked for: `seeds` times the trips in each run. */
  trips: number;
  /** Trips that ended at their goal. */
  reached: number;
  /** Trips that took no more moves than the shortest route. */
  shortestTaken: number;
  /** Moves made on the trips that reached their goal. */
  moves: number;
  /** Moves the shortest routes for those trips would have taken. */
  shortest: number;
}

const STEPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, -1],
  [-1, 0],
  [1, 0],
];

/** The fewest moves between two cells of a grid, or -1 if there is no way. */
export function shortestRoute(grid: GridWorld, from: State, to: State): number {
  const start = grid.cellOf(from);
  const end = grid.cellOf(to);
  const key = (x: number, y: number) => `${x},${y}`;
  const seen = new Set([key(start.x, start.y)]);
  let frontier = [start];
  for (let moves = 0; frontier.length > 0; moves++) {
    const next: { x: number; y: number }[] = [];
    for (const cell of frontier) {
      if (cell.x === end.x && cell.y === end.y) return moves;
      for (const [dx, dy] of STEPS) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || y < 0 || x >= grid.width || y >= grid.height || grid.isWall(x, y)) continue;
        if (seen.has(key(x, y))) continue;
        seen.add(key(x, y));
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return -1;
}

/**
 * Explore, then make `tripsPerRun` trips to cells picked at random, one after
 * another. Seeds run from 1 to `seeds`. Only for worlds laid out on a grid.
 */
export function routes(recipe: Recipe, scenario: Scenario, seeds: number, tripsPerRun = 10): RouteRow {
  const row: RouteRow = {
    recipe: recipe.id,
    scenario: scenario.id,
    seeds,
    trips: 0,
    reached: 0,
    shortestTaken: 0,
    moves: 0,
    shortest: 0,
  };

  for (let seed = 1; seed <= seeds; seed++) {
    const run = new Run({ recipe, scenario, seed });
    if (!isGridWorld(run.world)) throw new Error(`${scenario.id} is not laid out on a grid`);
    const grid = run.world;
    const cells = openStates(grid);
    // Its own sequence, so the goals do not depend on what the agent does.
    const random = seededRandom(seed * 7919);

    run.do({ type: 'explore' });
    for (let trip = 0; trip < tripsPerRun; trip++) {
      const from = grid.getState();
      let goal = pick(cells, random);
      while (sameState(goal, from)) goal = pick(cells, random);

      const before = run.events.length;
      run.do({ type: 'goal', goal });
      const events = run.events.slice(before);
      const moves = events.filter((event) => event.type === 'step').length;

      row.trips += 1;
      if (events.at(-1)?.type !== 'reached') continue;
      const best = shortestRoute(grid, from, goal);
      row.reached += 1;
      row.moves += moves;
      row.shortest += best;
      if (moves <= best) row.shortestTaken += 1;
    }
  }
  return row;
}
