// Knowledge side: the knowledge base exactly as it is stored. One row per
// entry: its facts, everything seen to follow them, and how often. Nothing is
// grouped, hidden or renamed.

import { type Facts, factCount } from '../../../core/facts';
import type { Entry } from '../../../core/knowledge-base';
import type { Agent } from '../../../agents/agent';
import type { Summary } from '../../../runs/summary';
import { cx, h, put } from '../dom';
import { formatFacts } from '../words';

export type Sort = 'written' | 'facts';

export interface KnowledgeProps {
  agent: Agent;
  summary: Summary;
  sort: Sort;
  /** Keys of entries that apply to the situation shown in the lookup panel. */
  matched: ReadonlySet<string>;
  /** Keys of the entries that answered it. */
  answered: ReadonlySet<string>;
  /** Jump to the move that created an entry. */
  onShowMove(move: number): void;
}

const LIMIT = 400;

const chips = (facts: Facts) =>
  formatFacts(facts).split(', ').map((fact) => h('span', { class: 'fact' }, fact));

export function renderKnowledge(el: HTMLElement, props: KnowledgeProps): void {
  const { agent, summary } = props;
  const written = new Set(summary.lastStep?.writes.map((write) => write.key) ?? []);

  let entries = agent.kb.entries();
  if (props.sort === 'facts') {
    // A stable sort, so entries with the same number of facts stay in the order written.
    entries = [...entries].sort((a, b) => factCount(a.inputs) - factCount(b.inputs));
  } else {
    entries = [...entries].reverse(); // Newest first.
  }

  if (entries.length === 0) {
    put(el, h('p', { class: 'muted' }, 'Empty. A row is written each time the agent sees something happen.'));
    return;
  }

  const row = (entry: Entry) => {
    const origin = summary.origins.get(entry.key);
    const outcomes = [...entry.outcomes.values()];
    return h('tr', {
        class: cx(
          props.answered.has(entry.key) ? 'is-answer' : props.matched.has(entry.key) && 'is-match',
          written.has(entry.key) && 'is-written',
        ),
      },
      h('td', { class: 'kb-facts' }, ...chips(entry.inputs)),
      h('td', { class: 'kb-then' }, ...outcomes.map((outcome) => h('div', null, formatFacts(outcome.value)))),
      h('td', { class: 'kb-count' }, ...outcomes.map((outcome) => h('div', null, outcome.count))),
      h('td', { class: 'kb-move' },
        origin && h('button', {
          class: cx('chip', `chip-${origin.phase}`, origin.surprise && 'chip-surprise'),
          title: `Written at move ${origin.step}, ${origin.phase === 'explore' ? 'while exploring' : 'while following a plan'}${origin.surprise ? ', from a surprise' : ''}. Click to go there.`,
          onClick: () => props.onShowMove(origin.step),
        }, origin.step)),
    );
  };

  put(el,
    h('table', { class: 'kb' },
      h('thead', null,
        h('tr', null,
          h('th', null, 'Facts'),
          h('th', null, 'Followed by'),
          h('th', { class: 'kb-count' }, 'Seen'),
          h('th', { class: 'kb-move' }, 'Move'))),
      h('tbody', null, ...entries.slice(0, LIMIT).map(row)),
    ),
    entries.length > LIMIT && h('p', { class: 'muted' }, `Showing ${LIMIT} of ${entries.length}.`),
  );
}
