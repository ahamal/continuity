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
 * One tick per move, coloured by what was driving the agent, with the share
 * of its actions it does not yet trust drawn above. Drag to move through time.
 */
export function createTimeline(el: HTMLElement, onSeek: (position: number) => void): Timeline {
  const svg = s('svg', { class: 'timeline-svg', viewBox: `0 0 ${WIDTH} 60`, preserveAspectRatio: 'none' });
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

  el.replaceChildren(
    h('div', { class: 'timeline-rows' },
      h('span', { class: 'timeline-name' }, 'Left to learn'),
      h('span', { class: 'timeline-name' }, 'Moves'),
    ),
    svg,
  );

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

    // Share of actions not yet trusted, from 1 at the top to 0 at the bottom.
    const unknown = (step: StepEvent) =>
      1 - step.confidence.reduce((sum, row) => sum + Math.min(1, row.seen / row.needed), 0) / step.confidence.length;
    const y = (level: number) => 24 - level * 20;
    let line = `M0,${y(1)}`;
    steps.forEach((step, i) => {
      line += ` L${(i + 1) * slot},${y(unknown(step))}`;
    });
    if (steps.length > 0) {
      svg.append(
        s('path', { class: 'curve-area', d: `${line} L${steps.length * slot},${y(0)} L0,${y(0)} Z` }),
        s('path', { class: 'curve-line', d: line }),
      );
    }
    svg.append(s('line', { class: 'timeline-base', x1: 0, x2: WIDTH, y1: y(0) + 0.5, y2: y(0) + 0.5 }));

    steps.forEach((step, i) => {
      svg.append(
        s('rect', {
          class: cx('tick', `tick-${step.phase}`, step.surprise && 'tick-surprise', i >= shown && 'is-future'),
          x: i * slot + slot * 0.12,
          width: slot * 0.76,
          y: step.surprise ? 30 : 36,
          height: step.surprise ? 28 : 16,
        }),
      );
    });
    svg.append(s('line', { class: 'timeline-cursor', x1: shown * slot, x2: shown * slot, y1: 0, y2: 60 }));
  }

  return { update };
}
