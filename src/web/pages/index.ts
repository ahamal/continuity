import { everyCombination, everyRow, twoLevels } from '../../agents/recipes';
import type { Recipe } from '../../agents/recipes';
import { type LabOptions, createLab } from '../lab/lab';
import implementation from './implementation.html?raw';
import states from './states.html?raw';
import theory from './theory.html?raw';
import world1d from './world-1d.html?raw';
import world2d from './world-2d.html?raw';
import worldCombinations from './world-combinations.html?raw';
import worldEveryRow from './world-every-row.html?raw';
import worldWalls from './world-walls.html?raw';

export interface Page {
  id: string;
  /** Short name shown in the navigation. */
  label: string;
  /** Which part of the work the page belongs to. */
  part: number;
  /** True for the stage the work has reached. */
  current?: boolean;
  /** A lab page fills one screen and does not scroll as a whole. */
  layout?: 'lab';
  /** Fill `container` with the page. May return a function that cleans up. */
  mount(container: HTMLElement): (() => void) | void;
}

function prose(html: string): Page['mount'] {
  return (container) => {
    container.innerHTML = html;
  };
}

/**
 * A page with an interactive lab. The page marks where the lab goes with
 * `data-lab` and where its set-up controls go with `data-lab-setup`. Each lab
 * page names the recipe for its stage, so the page keeps showing that stage's
 * agent when later stages are added.
 */
function withLab(
  html: string,
  recipe: Recipe,
  scenarioIds: string[],
  options: Pick<LabOptions, 'knowledge' | 'stays' | 'trustedRow'> = {},
): Page['mount'] {
  return (container) => {
    container.innerHTML = html;
    const slot = container.querySelector<HTMLElement>('[data-lab]')!;
    const setupSlot = container.querySelector<HTMLElement>('[data-lab-setup]');
    return createLab(slot, { recipe, scenarioIds, setupSlot, ...options });
  };
}

/** The work is done in parts. A part with no pages yet has not been started. */
export const parts: { id: number; label: string; note: string }[] = [
  { id: 1, label: 'Part 1', note: 'The problem' },
  { id: 2, label: 'Part 2', note: 'Working backwards: continuities written by hand for each world. Not started.' },
];

/** The stages, in order. Each one is a page. */
export const pages: Page[] = [
  { id: 'theory', label: 'Theory', part: 1, mount: prose(theory) },
  { id: 'implementation', label: 'Implementation', part: 1, mount: prose(implementation) },
  { id: '1d', label: '1D world', part: 1, layout: 'lab', mount: withLab(world1d, twoLevels, ['1d']) },
  { id: '2d', label: '2D world', part: 1, layout: 'lab', mount: withLab(world2d, twoLevels, ['2d']) },
  { id: 'walls', label: '2D world with walls', part: 1, layout: 'lab', mount: withLab(worldWalls, twoLevels, ['2d-walls']) },
  { id: 'states', label: 'What is left open', part: 1, mount: prose(states) },
  {
    id: 'combinations',
    label: 'Every combination',
    part: 1,
    layout: 'lab',
    mount: withLab(worldCombinations, everyCombination, ['1d', '2d', '2d-walls'], {
      knowledge: 'combinations',
      trustedRow: 'the row of the action with its usual change',
    }),
  },
  {
    id: 'every-row',
    label: 'Every row has a say',
    part: 1,
    current: true,
    layout: 'lab',
    mount: withLab(worldEveryRow, everyRow, ['1d', '2d', '2d-walls'], {
      knowledge: 'combinations',
      stays: 'expected',
      trustedRow: "a row that agrees with the action's answer",
    }),
  },
];
