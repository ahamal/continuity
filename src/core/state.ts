/** A world state: a tuple of numbers, such as `[x, y]`. */
export type State = readonly number[];

export type Action = string;

/**
 * One part of a state, with the name of the fact that reports a change in it.
 * For example `{ name: 'x', change: 'dx' }`.
 */
export interface StatePart {
  readonly name: string;
  readonly change: string;
}

/**
 * The little an agent is told about a world before it has seen anything:
 * which actions exist and what the parts of a state are called.
 */
export interface WorldShape {
  readonly actions: readonly Action[];
  readonly stateParts: readonly StatePart[];
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
