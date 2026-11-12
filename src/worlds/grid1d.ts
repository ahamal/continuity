import type { Action, State } from '../core/state';
import { type GridWorld, clamp } from './world';

export interface Grid1DOptions {
  size?: number;
  start?: number;
  walls?: readonly number[];
}

/** A line of cells. The agent moves left or right and stops at the ends. */
export class Grid1D implements GridWorld {
  readonly name = '1D line';
  readonly actions = ['left', 'right'] as const;
  readonly kind = 'grid' as const;
  readonly stateParts = [{ name: 'pos', change: 'dx' }] as const;
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
