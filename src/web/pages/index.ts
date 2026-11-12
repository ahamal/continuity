// The pages of the site, in order. Each is a written page. A page can hold
// small labs between its paragraphs: it marks where with `data-demo="name"`,
// and the lab for that name is set up in `demos` below.
//
// Stage numbers come from the order of this list. Nothing else should write a
// stage number down, so that the list can be reordered.

import { movesCounted, readHierarchy } from '../../agents/from-counts/from-counts';
import { everyRow, fromCounts, generalFirst, twoLevels } from '../../agents/recipes';
import { type LabOptions, createLab } from '../lab/lab';
import findings from './findings.html?raw';
import generalFirstPage from './general-first.html?raw';
import hierarchy from './hierarchy.html?raw';
import implementation from './implementation.html?raw';
import remembering from './remembering.html?raw';
import theory from './theory.html?raw';
import voting from './voting.html?raw';

export interface Page {
  id: string;
  /** Name shown in the navigation. It says what the page is about. */
  label: string;
  /** Which part of the work the page belongs to. */
  part: number;
  /** True for the stage the work has reached. */
  current?: boolean;
  /** `lab`: one fixed screen that does not scroll. No page uses it now. */
  layout?: 'lab';
  /**
   * Fill `container` with the page. `stage` is the page's number, such as
   * "03". May return a function that cleans up.
   */
  mount(container: HTMLElement, stage: string): (() => void) | void;
}

// The walls world first: it is where each agent's limits show.
const WORLDS = ['2d-walls', '2d', '1d'];

/** The small labs that pages place between their paragraphs, by name. */
const demos: Record<string, LabOptions> = {
  // The first agent, with the rows it has written beside it.
  remembering: {
    recipe: twoLevels,
    scenarioIds: WORLDS,
    compact: true,
    knowledge: 'rows',
    holdsTitle: 'Knowledge base',
  },
  // Every row has a say. The point is the bars, and the row behind each one.
  voting: {
    recipe: everyRow,
    scenarioIds: ['2d-walls'],
    compact: true,
    knowledge: 'reasons',
    holdsTitle: 'Knowledge base',
    stays: 'expected',
  },
  // The hierarchy read from the counts, linked to the world.
  hierarchy: {
    recipe: fromCounts,
    scenarioIds: WORLDS,
    compact: true,
    knowledge: 'hierarchy',
    holdsTitle: 'Knowledge base',
    hierarchy: (agent) => ({ rows: readHierarchy(agent), moves: movesCounted(agent) }),
    stays: 'expected',
  },
  // The same store, read from the general row down.
  general: {
    recipe: generalFirst,
    scenarioIds: WORLDS,
    compact: true,
    knowledge: 'hierarchy',
    holdsTitle: 'Knowledge base',
    hierarchy: (agent) => ({ rows: readHierarchy(agent), moves: movesCounted(agent) }),
    stays: 'expected',
  },
};

/**
 * A written page. Its text says `--stage: '0'` where the page's number goes,
 * for numbering its sections, and `data-demo="name"` where a lab goes.
 */
function paper(html: string): Page['mount'] {
  return (container, stage) => {
    container.innerHTML = html.replace("--stage: '0'", `--stage: '${Number(stage)}'`);
    const cleanups = [...container.querySelectorAll<HTMLElement>('[data-demo]')].map((slot) =>
      createLab(slot, demos[slot.dataset.demo!]!),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  };
}

/** The work is done in parts. A part with no pages yet has not been started. */
export const parts: { id: number; label: string; note: string }[] = [
  { id: 1, label: 'Part 1', note: 'The problem' },
  { id: 2, label: 'Part 2', note: 'Working backwards: continuities written by hand for each world. Not started.' },
];

export const pages: Page[] = [
  { id: 'theory', label: 'Identity Continuity', part: 1, mount: paper(theory) },
  { id: 'implementation', label: 'Building the engine', part: 1, mount: paper(implementation) },
  { id: 'remembering', label: 'The first agent', part: 1, mount: paper(remembering) },
  { id: 'voting', label: 'The second agent', part: 1, mount: paper(voting) },
  { id: 'hierarchy', label: 'The third agent', part: 1, mount: paper(hierarchy) },
  { id: 'general-first', label: 'The fourth agent', part: 1, mount: paper(generalFirstPage) },
  { id: 'findings', label: 'Findings', part: 1, current: true, mount: paper(findings) },
];
