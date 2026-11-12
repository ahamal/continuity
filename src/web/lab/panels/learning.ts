// Knowledge side: the level of knowledge. One row per action with its
// sightings and its general rule, then how much the agent has tried itself.

import type { Agent } from '../../../agents/agent';
import { factsKey } from '../../../core/facts';
import type { Summary } from '../../../runs/summary';
import { cx, h, put } from '../dom';
import { formatFacts } from '../words';

export interface LearningProps {
  agent: Agent;
  summary: Summary;
  /** How many different moves exist in this world, if that can be counted. */
  possibleMoves: number | null;
}

/** One word for how much the agent knows. */
export function renderLevel(el: HTMLElement, agent: Agent): void {
  const confidence = agent.confidence();
  const seen = confidence.some((row) => row.seen > 0);
  const trusted = confidence.every((row) => row.seen >= row.needed);
  el.textContent = !seen ? 'Knows nothing' : trusted ? 'Confident' : 'Learning';
}

export function renderLearning(el: HTMLElement, props: LearningProps): void {
  const { agent, summary } = props;

  const rows = agent.confidence().map((row) => {
    // Filled squares are sightings. Empty ones are what is left to be curious about.
    const squares = h('span', {
      class: 'squares',
      title: `Seen ${row.seen} times. Trusted after ${row.needed}.`,
    });
    for (let i = 0; i < row.needed; i++) squares.append(h('i', { class: i < row.seen ? 'is-on' : '' }));

    const entry = agent.kb.get(factsKey({ action: row.action }));
    const outcomes = entry ? [...entry.outcomes.values()].sort((a, b) => b.count - a.count) : [];

    return h('tr', { class: cx(summary.lastStep?.action === row.action && 'is-latest') },
      h('th', { scope: 'row' }, row.action),
      h('td', null, squares),
      h('td', { class: 'rule' },
        ...outcomes.map((outcome, i) =>
          h('span', { class: i > 0 ? 'muted' : '' }, `${formatFacts(outcome.value)} ×${outcome.count}`)),
      ),
    );
  });

  const tried = summary.tried.size;
  put(el,
    h('table', { class: 'actions' },
      h('thead', null, h('tr', null, h('th', null, 'Action'), h('th', null, 'Seen'), h('th', null, 'General rule'))),
      h('tbody', null, ...rows),
    ),
    props.possibleMoves !== null &&
      h('div', { class: 'coverage' },
        h('div', { class: 'coverage-bar' }, h('i', { style: `width:${((tried / props.possibleMoves) * 100).toFixed(1)}%` })),
        h('span', null, `Tried ${tried} of ${props.possibleMoves} moves itself. The rest is assumed from the general rules.`),
      ),
  );
}
