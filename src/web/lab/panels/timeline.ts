// State side: the run over time. One tick per move. Drag to move through it.

import type { RunEvent, StepEvent } from '../../../runs/events';
import { cx, h, s } from '../dom';

export interface TimelineProps {
  events: readonly RunEvent[];
  cursor: number;
  stops: readonly number[];
}

export interface Timeline {
  update(props: TimelineProps): void;
}

const WIDTH = 1000;
/** With few moves, ticks keep this many slots so they do not grow huge. */
const MIN_SLOTS = 40;

/**
 * One tick per move, coloured by what was driving the agent. Surprises stand
 * taller. Drag to move through time.
 */
export function createTimeline(el: HTMLElement, onSeek: (position: number) => void): Timeline {
  const svg = s('svg', { class: 'timeline-svg', viewBox: `0 0 ${WIDTH} 30`, preserveAspectRatio: 'none' });
  let props: TimelineProps = { events: [], cursor: 0, stops: [0] };
  let stepAt: number[] = [];
  let slots = MIN_SLOTS;

  const seekTo = (clientX: number) => {
    const box = svg.getBoundingClientRect();
    const fraction = (clientX - box.left) / box.width;
    const move = Math.max(0, Math.min(stepAt.length, Math.ceil(fraction * slots)));
    if (move === 0) return onSeek(0);
    const index = stepAt[move - 1]!;
    onSeek(props.stops.find((stop) => stop > index) ?? props.events.length);
  };
  svg.addEventListener('pointerdown', (event) => {
    const pointer = event as PointerEvent;
    svg.setPointerCapture(pointer.pointerId);
    seekTo(pointer.clientX);
  });
  svg.addEventListener('pointermove', (event) => {
    const pointer = event as PointerEvent;
    if (pointer.buttons & 1) seekTo(pointer.clientX);
  });

  const label = h('span', { class: 'timeline-label' });
  el.replaceChildren(label, svg);

  function update(next: TimelineProps): void {
    props = next;
    stepAt = [];
    const steps: StepEvent[] = [];
    props.events.forEach((event, i) => {
      if (event.type === 'step') {
        stepAt.push(i);
        steps.push(event);
      }
    });
    const shown = stepAt.filter((i) => i < props.cursor).length;
    slots = Math.max(steps.length, MIN_SLOTS);
    const slot = WIDTH / slots;
    svg.replaceChildren();

    label.textContent = steps.length === 0 ? 'No moves' : `Move ${shown} of ${steps.length}`;

    steps.forEach((step, i) => {
      svg.append(
        s('rect', {
          class: cx('tick', `tick-${step.phase}`, step.surprise && 'tick-surprise', i >= shown && 'is-future'),
          x: i * slot + slot * 0.12,
          width: slot * 0.76,
          y: step.surprise ? 2 : 10,
          height: step.surprise ? 26 : 14,
        }),
      );
    });
    svg.append(s('line', { class: 'timeline-cursor', x1: shown * slot, x2: shown * slot, y1: 0, y2: 30 }));
  }

  return { update };
}
