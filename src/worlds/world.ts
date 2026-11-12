import type { Facts } from '../engine/facts';

/** A world state: a tuple of numbers, such as `[x, y]`. */
export type State = readonly number[];

export type Action = string;

/**
 * Anything the agent can live in. The agent sees only this interface: it can
 * read the state, act, and ask how two states differ.
 */
export interface World {
  readonly name: string;
  readonly actions: readonly Action[];
  /** Names of the change facts this world reports, such as `['dx', 'dy']`. */
  readonly diffKeys: readonly string[];

  getState(): State;
  /** Carry out an action and return the new state. */
  step(action: Action): State;
  distance(a: State, b: State): number;
  /** What changed between two states, as facts. */
  computeDiff(before: State, after: State): Facts;
  /** Name the parts of a state as facts, for example `[4, 4]` → `{ x: 4, y: 4 }`. */
  describe(state: State): Facts;
  /** The state reached by applying a change to a state. */
  applyDiff(state: State, diff: Facts): State;
}

/** A world laid out on a grid, which the viewer knows how to draw. */
export interface GridWorld extends World {
  readonly width: number;
  readonly height: number;
  isWall(x: number, y: number): boolean;
  /** The grid cell a state occupies. */
  cellOf(state: State): { x: number; y: number };
  /** The state for a grid cell. */
  stateAt(x: number, y: number): State;
}

export function sameState(a: State, b: State): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function stateKey(state: State): string {
  return state.join(',');
}

export function formatState(state: State): string {
  return `(${state.join(', ')})`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
