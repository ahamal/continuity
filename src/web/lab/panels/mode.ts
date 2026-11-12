// State side: what the agent is doing and what drives it, the commands that
// make sense now, and the explanation of its last move.

import { type State, sameState } from '../../../core/state';
import type { StepEvent } from '../../../runs/events';
import type { Summary } from '../../../runs/summary';
import { cx, h } from '../dom';
import { basisPhrase, formatPath, formatState, plural } from '../words';

export interface ModeProps {
  summary: Summary;
  position: State;
  suggested: readonly State[];
  onExplore(): void;
  onGoal(goal: State): void;
}

/**
 * What the agent is doing, what is driving it, and what you can ask of it
 * next.
 */
export function renderMode(el: HTMLElement, props: ModeProps): void {
  const { summary } = props;
  const mode = summary.mode;
  const drive =
    mode.kind === 'exploring' ? 'explore' : mode.kind === 'heading' ? 'goal' : 'idle';

  let title: string;
  let sentence: string;
  switch (mode.kind) {
    case 'blank':
      title = 'Knows nothing';
      sentence = 'It has not seen anything yet. Every action is new to it.';
      break;
    case 'exploring':
      title = 'Exploring';
      sentence = 'Driven by curiosity. It tries the action it knows least about, and learns from what happens.';
      break;
    case 'explored':
      title = mode.confident ? 'Confident' : 'Stopped exploring';
      sentence = mode.confident
        ? `Every action has been seen enough to trust, after ${plural(mode.steps, 'move')}. It can now predict places it has never been.`
        : `It used all ${mode.steps} moves without becoming confident in every action.`;
      break;
    case 'heading': {
      title = `Heading to ${formatState(mode.goal)}`;
      const plan = summary.plan;
      sentence = plan
        ? `Driven by a goal. It is following plan ${plan.attempt}, built from what it has learned: ${formatPath(plan.path) || 'no moves'}.${plan.method === 'greedy' ? ' Its search gave up, so this plan just steps closer.' : ''}`
        : 'Driven by a goal. It is about to plan a route from what it has learned.';
      break;
    }
    case 'reached':
      title = `Reached ${formatState(mode.goal)}`;
      sentence = `It got there in ${plural(mode.steps, 'move')}. It kept learning on the way.`;
      break;
    case 'failed':
      title = `Gave up on ${formatState(mode.goal)}`;
      sentence =
        mode.reason === 'no path'
          ? 'It could not find any route from what it knows.'
          : `It planned again after every surprise and ran out of attempts, after ${plural(mode.steps, 'move')}.`;
      break;
  }

  const actions = h('div', { class: 'mode-actions' });
  const idle = mode.kind !== 'exploring' && mode.kind !== 'heading';
  if (mode.kind === 'blank') {
    actions.append(h('button', { class: 'btn btn-explore', onClick: props.onExplore }, 'Start exploring'));
  } else if (idle) {
    if (mode.kind === 'explored' && !mode.confident) {
      actions.append(h('button', { class: 'btn btn-explore', onClick: props.onExplore }, 'Explore more'));
    }
    for (const goal of props.suggested) {
      if (sameState(goal, props.position)) continue;
      actions.append(
        h('button', { class: 'btn btn-goal', onClick: () => props.onGoal(goal) }, `Send it to ${formatState(goal)}`),
      );
    }
    actions.append(h('span', { class: 'mode-hint' }, 'or click any cell below'));
  }

  el.className = cx('mode', `mode-${drive}`);
  el.replaceChildren(
    h('p', { class: 'label' }, 'What it is doing'),
    h('h2', { class: 'mode-title' }, title),
    h('p', { class: 'mode-sentence' }, sentence),
    actions,
  );
}

/** Why the agent made its last move, and how it turned out. */
export function renderLastMove(el: HTMLElement, summary: Summary): void {
  el.replaceChildren(...lastMove(summary.lastStep, summary.steps.length));
}

function lastMove(step: StepEvent | null, number: number): (HTMLElement | string)[] {
  if (!step) return [h('p', { class: 'why-line muted' }, 'It has not moved yet.')];

  const parts: (HTMLElement | string)[] = [];
  const action = h('strong', { class: `why-action why-${step.phase}` }, step.action);

  if (step.phase === 'explore' && step.choice) {
    parts.push(
      h('p', { class: 'why-line' }, `Move ${number}. At ${formatState(step.from)} it chose `, action,
        step.choice.random
          ? ' at random, because nothing here was new to it.'
          : ', the action it was most curious about here.'),
      h('div', { class: 'scores' },
        ...step.choice.scores.map((score) =>
          h('span', { class: cx('score', score.action === step.action && 'is-chosen') },
            h('span', { class: 'score-name' }, score.action),
            h('span', { class: 'score-bar' }, h('i', { style: `width:${Math.round(score.curiosity * 100)}%` })),
            h('span', { class: 'score-value' }, score.curiosity.toFixed(2)),
          ),
        ),
      ),
    );
  } else {
    const where = step.planStep ? ` (move ${step.planStep.index} of ${step.planStep.of} in the plan)` : '';
    parts.push(
      h('p', { class: 'why-line' }, `Move ${number}. At ${formatState(step.from)} the plan said `, action, `${where}.`),
    );
  }

  const stayed = sameState(step.from, step.to);
  const result = stayed ? `stayed at ${formatState(step.to)}` : `went to ${formatState(step.to)}`;
  if (!step.expected) {
    parts.push(h('p', { class: 'why-line' }, `It had no idea what would happen. It ${result}.`));
  } else if (!step.surprise) {
    parts.push(
      h('p', { class: 'why-line' },
        `It expected ${formatState(step.expected.state)}, from ${basisPhrase(step.expected, step.action)}. That is what happened.`),
    );
  } else {
    parts.push(
      h('p', { class: 'why-line is-surprise' },
        h('strong', null, 'Surprise. '),
        `It expected ${formatState(step.expected.state)}, from ${basisPhrase(step.expected, step.action)}, but it ${result}. `,
        step.phase === 'goal'
          ? 'It stored this as an exception and planned again.'
          : 'It stored this as an exception.'),
    );
  }
  return parts;
}
