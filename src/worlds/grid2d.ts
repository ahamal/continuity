import type { Facts } from '../engine/facts';
import { type Action, type GridWorld, type State, clamp } from './world';

export interface Grid2DOptions {
  width?: number;
  height?: number;
  start?: readonly [number, number];
  walls?: readonly (readonly [number, number])[];
}

/**
 * A grid of cells. The agent moves left, right, up or down, stops at the
 * edges, and cannot enter a wall. `up` increases y.
 */
export class Grid2D implements GridWorld {
  readonly name: string;
  readonly actions = ['left', 'right', 'up', 'down'] as const;
  readonly diffKeys = ['dx', 'dy'] as const;
  readonly width: number;
  readonly height: number;

  private x: number;
  private y: number;
  private readonly walls: ReadonlySet<string>;

  constructor(options: Grid2DOptions = {}) {
    this.width = options.width ?? 12;
    this.height = options.height ?? 12;
    [this.x, this.y] = options.start ?? [4, 4];
    this.walls = new Set((options.walls ?? []).map(([x, y]) => `${x},${y}`));
    this.name = this.walls.size > 0 ? '2D grid with walls' : '2D grid';
  }

  getState(): State {
    return [this.x, this.y];
  }

  step(action: Action): State {
    let nextX = this.x;
    let nextY = this.y;
    if (action === 'right') nextX += 1;
    else if (action === 'left') nextX -= 1;
    else if (action === 'up') nextY += 1;
    else if (action === 'down') nextY -= 1;
    else return this.getState();

    nextX = clamp(nextX, 0, this.width - 1);
    nextY = clamp(nextY, 0, this.height - 1);
    if (this.isWall(nextX, nextY)) return this.getState();

    this.x = nextX;
    this.y = nextY;
    return this.getState();
  }

  distance(a: State, b: State): number {
    return Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!);
  }

  computeDiff(before: State, after: State): Facts {
    return { dx: after[0]! - before[0]!, dy: after[1]! - before[1]! };
  }

  describe(state: State): Facts {
    return { x: state[0]!, y: state[1]! };
  }

  applyDiff(state: State, diff: Facts): State {
    return [state[0]! + asNumber(diff.dx), state[1]! + asNumber(diff.dy)];
  }

  isWall(x: number, y: number): boolean {
    return this.walls.has(`${x},${y}`);
  }

  cellOf(state: State): { x: number; y: number } {
    return { x: state[0]!, y: state[1]! };
  }

  stateAt(x: number, y: number): State {
    return [x, y];
  }
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}
