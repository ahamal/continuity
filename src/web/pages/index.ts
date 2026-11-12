import { createLab } from '../lab/lab';
import implementation from './implementation.html?raw';
import states from './states.html?raw';
import theory from './theory.html?raw';
import world1d from './world-1d.html?raw';
import world2d from './world-2d.html?raw';

export interface Page {
  id: string;
  /** Short name shown in the navigation. */
  label: string;
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
 * `data-lab`, and may supply notes for the lab's Notes tab in a
 * `<template data-lab-notes>`.
 */
function withLab(html: string, scenarioIds: string[]): Page['mount'] {
  return (container) => {
    container.innerHTML = html;
    const slot = container.querySelector<HTMLElement>('[data-lab]')!;
    const notes = container.querySelector<HTMLTemplateElement>('template[data-lab-notes]');
    return createLab(slot, scenarioIds, notes?.innerHTML ?? '');
  };
}

/** The stages, in order. Each one is a page. */
export const pages: Page[] = [
  { id: 'theory', label: 'Theory', mount: prose(theory) },
  { id: 'implementation', label: 'Implementation', mount: prose(implementation) },
  { id: '1d', label: '1D world', layout: 'lab', mount: withLab(world1d, ['1d']) },
  { id: '2d', label: '2D world', layout: 'lab', mount: withLab(world2d, ['2d', '2d-walls']) },
  { id: 'states', label: 'State representation', current: true, mount: prose(states) },
];
