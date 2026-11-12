// Icons for the lab, from the Lucide set. Every icon the lab uses is named
// here, so the set can be swapped in one place.

import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Brain, CircleCheck, CircleHelp, CircleX,
  Compass, Database, Dices, Flag, Gauge, Hourglass, type IconNode, Navigation, Pause, Play,
  RotateCcw, SkipBack, SkipForward, Sprout, StepBack, StepForward, createElement,
} from 'lucide';

export const icons = {
  state: Activity,
  knowledge: Brain,
  entries: Database,
  explore: Compass,
  goal: Flag,
  send: Navigation,
  waiting: Hourglass,
  reached: CircleCheck,
  failed: CircleX,
  nothing: CircleHelp,
  learning: Sprout,
  confident: CircleCheck,
  play: Play,
  pause: Pause,
  toStart: SkipBack,
  toEnd: SkipForward,
  back: StepBack,
  forward: StepForward,
  speed: Gauge,
  seed: Dices,
  restart: RotateCcw,
} satisfies Record<string, IconNode>;

/** Arrows for actions that are directions. Other actions simply get no icon. */
const actionIcons: Record<string, IconNode> = {
  left: ArrowLeft,
  right: ArrowRight,
  up: ArrowUp,
  down: ArrowDown,
};

export function icon(node: IconNode, size = 16): SVGElement {
  const el = createElement(node);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('icon');
  return el;
}

/** The icon for an action, or null if it has none. */
export function actionIcon(action: string, size = 14): SVGElement | null {
  const node = actionIcons[action];
  return node ? icon(node, size) : null;
}
