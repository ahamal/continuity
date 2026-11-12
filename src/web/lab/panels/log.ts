// State side: every event of the run as a list. Click a line to go there.

import type { RunEvent } from '../../../runs/events';
import { cx, h } from '../dom';
import { formatPath, formatState, plural } from '../words';

export interface LogProps {
  events: readonly RunEvent[];
  cursor: number;
  stops: readonly number[];
  onSeek(position: number): void;
}

/** Everything that happened, grouped by what the agent was doing. Click a line to go there. */
export function renderLog(el: HTMLElement, props: LogProps): void {
  if (props.events.length === 0) {
    el.replaceChildren(h('p', { class: 'empty' }, 'Nothing has happened yet.'));
    return;
  }

  const list = h('ol', { class: 'log' });
  let move = 0;
  let current: HTMLElement | null = null;

  props.events.forEach((event, index) => {
    const after = props.stops.find((stop) => stop > index) ?? props.events.length;
    const future = index >= props.cursor;
    let line: HTMLElement;

    switch (event.type) {
      case 'explore':
        line = h('li', { class: 'log-head log-explore' }, 'Exploring, driven by curiosity');
        break;
      case 'goal':
        line = h('li', { class: 'log-head log-goal' }, `Heading to ${formatState(event.goal)}, driven by a goal`);
        break;
      case 'plan':
        line = h('li', { class: 'log-note' },
          `Plan ${event.attempt}: ${formatPath(event.path) || 'no moves'}`,
          event.method === 'greedy' && h('span', { class: 'muted' }, '  (search gave up, stepping closer)'));
        break;
      case 'confident':
        line = h('li', { class: 'log-note' }, `Confident after ${plural(event.steps, 'move')}.`);
        break;
      case 'explore-exhausted':
        line = h('li', { class: 'log-note' }, `Stopped after ${event.steps} moves, not yet confident.`);
        break;
      case 'reached':
        line = h('li', { class: 'log-note' }, `Reached ${formatState(event.goal)} in ${plural(event.steps, 'move')}.`);
        break;
      case 'no-path':
        line = h('li', { class: 'log-note' }, 'No route found.');
        break;
      case 'max-replans':
        line = h('li', { class: 'log-note' }, 'Gave up after planning ten times.');
        break;
      case 'step': {
        move += 1;
        const note = event.surprise
          ? `surprise: expected ${formatState(event.expected!.state)}`
          : event.phase === 'explore'
            ? event.choice!.random ? 'at random' : `curiosity ${event.choice!.curiosity.toFixed(2)}`
            : '';
        line = h('li', { class: cx('log-step', `log-${event.phase}`, event.surprise && 'is-surprise') },
          h('span', { class: 'log-n' }, move),
          h('span', { class: 'log-move' }, `${formatState(event.from)} ${event.action} → ${formatState(event.to)}`),
          h('span', { class: 'log-detail' }, note));
        break;
      }
    }

    if (future) line.classList.add('is-future');
    if (after === props.cursor && event.type === 'step') {
      line.classList.add('is-current');
      current = line;
    }
    line.addEventListener('click', () => props.onSeek(after));
    list.append(line);
  });

  el.replaceChildren(list);
  (current as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
}
