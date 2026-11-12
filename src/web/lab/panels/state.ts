// State side: one line for what the agent is doing, one line for its last move.

import { type State, sameState } from '../../../core/state';
import type { Summary } from '../../../runs/summary';
import { h, put } from '../dom';
import { formatState } from '../words';

/** What the agent is doing right now. The mark's colour says what drives it. */
export function renderActivity(el: HTMLElement, summary: Summary, position: State): void {
  const mode = summary.mode;
  let drive = 'idle';
  let text: string;
  switch (mode.kind) {
    case 'exploring':
      drive = 'explore';
      text = 'Exploring';
      break;
    case 'heading':
      drive = 'goal';
      text = `Heading to ${formatState(mode.goal)}`;
      break;
    case 'reached':
      text = `Reached ${formatState(mode.goal)}`;
      break;
    case 'failed':
      text = `Gave up on ${formatState(mode.goal)}`;
      break;
    default:
      text = `Waiting at ${formatState(position)}`;
  }
  put(el, h('i', { class: `drive drive-${drive}` }), text);
}

/** The last move: what it did, why, and whether it went as expected. */
export function renderLastMove(el: HTMLElement, summary: Summary): void {
  const step = summary.lastStep;
  if (!step) {
    put(el, h('span', { class: 'muted' }, 'No moves yet.'));
    return;
  }

  const why =
    step.phase === 'goal'
      ? `plan step ${step.planStep!.index} of ${step.planStep!.of}`
      : step.choice!.random
        ? 'picked at random, nothing new here'
        : `most curious about it (${step.choice!.curiosity.toFixed(2)})`;

  const stayed = sameState(step.from, step.to);
  const outcome = !step.expected
    ? h('span', { class: 'muted' }, 'had no expectation')
    : step.surprise
      ? h('span', { class: 'surprise' }, `surprise: expected ${formatState(step.expected.state)}`)
      : h('span', { class: 'muted' }, 'as expected');

  put(el,
    h('span', { class: 'move-n' }, summary.steps.length),
    h('span', { class: 'move-what' },
      `${formatState(step.from)} `,
      h('b', { class: `via via-${step.phase}` }, step.action),
      stayed ? ' → stayed' : ` → ${formatState(step.to)}`),
    h('span', { class: 'muted' }, why),
    outcome,
  );
}
