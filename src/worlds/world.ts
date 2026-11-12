import type { Action, State, StatePart, WorldShape } from '../core/state';

/**
 * A place things happen in. A world only holds a state and changes it when an
 * action is taken. How a state is turned into facts is the agent's business,
 * not the world's.
 */
export interface World extends WorldShape {
  readonly name: string;
  /** Which drawing the viewer should use, such as `grid`. */
  readonly kind: string;
  readonly actions: readonly Action[];
  readonly stateParts: readonly StatePart[];

  getState(): State;
  /** Carry out an action and return the new state. */
  step(action: Action): State;
}

/** A world laid out on a grid. */
export interface GridWorld extends World {
  readonly kind: 'grid';
  readonly width: number;
  readonly height: number;
  isWall(x: number, y: number): boolean;
  /** The grid cell a state occupies. */
  cellOf(state: State): { x: number; y: number };
  /** The state for a grid cell. */
  stateAt(x: number, y: number): State;
}

export function isGridWorld(world: World): world is GridWorld {
  return world.kind === 'grid';
}

/** Every state on a grid that is not a wall. */
export function openStates(grid: GridWorld): State[] {
  const states: State[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!grid.isWall(x, y)) states.push(grid.stateAt(x, y));
    }
  }
  return states;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
