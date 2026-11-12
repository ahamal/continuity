// Knowledge side, derived: confidence. The agent trusts an action once its
// one-fact row has been seen a fixed number of times. Curiosity is what is
// left. Also how many moves the agent has made itself.

import type { Agent } from '../../../agents/agent';
import type { Summary } from '../../../runs/summary';
import { cx, h, put } from '../dom';
import { actionIcon } from '../icons';

export interface LearningProps {
  agent: Agent;
  summary: Summary;
  /** How many different moves exist in this world, if that can be counted. */
  possibleMoves: number | null;
}

export function renderLearning(el: HTMLElement, props: LearningProps): void {
  const { agent, summary } = props;
  const confidence = agent.confidence();
  const needed = confidence[0]?.needed ?? 0;

  const items = confidence.map((row) => {
    const squares = h('span', { class: 'squares' });
    for (let i = 0; i < row.needed; i++) squares.append(h('i', { class: i < row.seen ? 'is-on' : '' }));
    return h('span', { class: cx('trust', summary.lastStep?.action === row.action && 'is-latest') },
      h('span', { class: 'action' }, actionIcon(row.action), row.action),
      squares,
    );
  });

  const tried = summary.tried.size;
  put(el,
    h('div', { class: 'trusts' }, ...items),
    h('p', { class: 'muted derived-note' },
      `Trusted once the action's one-fact row is seen ${needed} times (fixed in the code). `,
      props.possibleMoves !== null && `It has made ${tried} of ${props.possibleMoves} possible moves itself.`),
  );
}
