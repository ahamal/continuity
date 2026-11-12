import type { Facts } from '../engine/facts';
import { type Action, type GridWorld, type State, clamp } from './world';

export interface Grid1DOptions {
  size?: number;
  start?: number;
  walls?: readonly number[];
}

/** A line of cells. The agent moves left or right and stops at the ends. */
export class Grid1D implements GridWorld {
  readonly name = '1D line';
  readonly actions = ['left', 'right'] as const;
  readonly diffKeys = ['dx'] as const;
  readonly width: number;
  readonly height = 1;

  private pos: number;
  private readonly walls: ReadonlySet<number>;

  constructor(options: Grid1DOptions = {}) {
    this.width = options.size ?? 12;
    this.pos = options.start ?? 4;
    this.walls = new Set(options.walls ?? []);
  }

  getState(): State {
    return [this.pos];
  }

  step(action: Action): State {
    const before = this.pos;
    let next: number;
    if (action === 'right') next = this.pos + 1;
    else if (action === 'left') next = this.pos - 1;
    else return this.getState();

    next = clamp(next, 0, this.width - 1);
    if (this.walls.has(next)) next = before;

    this.pos = next;
    return this.getState();
  }

  distance(a: State, b: State): number {
    return Math.abs(a[0]! - b[0]!);
  }

  computeDiff(before: State, after: State): Facts {
    return { dx: after[0]! - before[0]! };
  }

  describe(state: State): Facts {
    return { pos: state[0]! };
  }

  applyDiff(state: State, diff: Facts): State {
    return [state[0]! + asNumber(diff.dx)];
  }

  isWall(x: number, _y: number): boolean {
    return this.walls.has(x);
  }

  cellOf(state: State): { x: number; y: number } {
    return { x: state[0]!, y: 0 };
  }

  stateAt(x: number, _y: number): State {
    return [x];
  }
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}
