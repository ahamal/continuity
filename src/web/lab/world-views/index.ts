// World drawings. Each kind of world registers its own drawing here, so a
// board game can be added without touching the rest of the lab.

import type { State } from '../../../core/state';
import type { Run } from '../../../runs/run';
import type { Summary } from '../../../runs/summary';
import { type World, isGridWorld } from '../../../worlds/world';
import { createGridView } from './grid';

/** What a world drawing is asked to show. */
export interface Scene {
  /** The run as it was at the position being shown. */
  run: Run;
  summary: Summary;
  selected: State | null;
}

/** A drawing of one kind of world. Each kind of world brings its own. */
export interface WorldView {
  readonly el: Element;
  update(scene: Scene): void;
  /** Where on screen a state is drawn, for placing things beside it. */
  rectOf(state: State): DOMRect | null;
  /** Every state the agent could stand in, if that can be listed. */
  states(): State[];
  /** Whether the agent could stand in this state. */
  isOpen(state: State): boolean;
}

export function createWorldView(world: World, onSelect: (state: State | null) => void): WorldView {
  if (isGridWorld(world)) return createGridView(world, onSelect);
  throw new Error(`No drawing for worlds of kind "${world.kind}"`);
}
