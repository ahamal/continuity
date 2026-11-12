// Knowledge side: the stored entries for exact cases. Exceptions first. The
// general rules are not repeated here: they are in the learning panel.

import type { Agent } from '../../../agents/agent';
import { factCount, factsKey } from '../../../core/facts';
import type { Entry, Outcome } from '../../../core/knowledge-base';
import type { Summary } from '../../../runs/summary';
import { cx, h, put } from '../dom';
import { formatFacts } from '../words';

export interface KnowledgeProps {
  agent: Agent;
  summary: Summary;
  /** Jump to the move that created an entry. */
  onShowMove(move: number): void;
}

const LIMIT = 200;

const isChange = (outcome: Outcome) => !Object.hasOwn(outcome.value, 'new_state');

const topChange = (entry: Entry): Outcome | null =>
  [...entry.outcomes.values()].filter(isChange).sort((a, b) => b.count - a.count)[0] ?? null;

/**
 * Entries that go against the general rule for their action: the exact case
 * saw a different change from the one the action usually causes.
 */
export function exceptionsIn(agent: Agent): Entry[] {
  return agent.kb.entries().filter((entry) => {
    const action = entry.inputs.action;
    if (factCount(entry.inputs) < 2 || action === undefined) return false;
    const general = agent.kb.get(factsKey({ action }));
    const usual = general && topChange(general);
    const here = topChange(entry);
    return Boolean(usual && here && factsKey(usual.value) !== factsKey(here.value));
  });
}

/** Draws the list and returns how many entries it holds. */
export function renderKnowledge(el: HTMLElement, props: KnowledgeProps): number {
  const { agent, summary } = props;
  const last = summary.lastStep;
  const used = new Set(last?.expected?.basis ?? []);
  const written = new Set(last?.writes.map((write) => write.key) ?? []);

  // One line per entry: a dot for how it was learned, its inputs, what followed.
  const row = (entry: Entry) => {
    const origin = summary.origins.get(entry.key);
    // An exact case stores the state that followed and, again, the change.
    // The state that followed says both, so only that is shown.
    const all = [...entry.outcomes.values()].sort((a, b) => b.count - a.count);
    const states = all.filter((outcome) => !isChange(outcome));
    const outcomes = states.length > 0 ? states : all;
    return h('li', { class: cx('entry', used.has(entry.key) && 'is-used', written.has(entry.key) && 'is-written') },
      h('i', { class: cx('dot', origin && `dot-${origin.phase}`, origin?.surprise && 'dot-surprise') }),
      h('span', { class: 'entry-text' },
        h('b', null, formatFacts(entry.inputs)),
        ' → ',
        outcomes.map((outcome) => `${formatFacts(outcome.value)} ×${outcome.count}`).join('  ·  ')),
      origin && h('button', { class: 'chip', title: 'Go to the move that created this entry', onClick: () => props.onShowMove(origin.step) }, `move ${origin.step}`),
    );
  };

  const exceptions = exceptionsIn(agent);
  const isException = new Set(exceptions.map((entry) => entry.key));
  const exact = agent.kb.entries().filter((entry) => factCount(entry.inputs) > 1 && !isException.has(entry.key));

  put(el,
    h('h3', null, 'Exceptions ', h('span', { class: 'count' }, exceptions.length)),
    exceptions.length === 0
      ? h('p', { class: 'muted' }, 'No place found yet where a general rule is wrong.')
      : h('ul', { class: 'entries' }, ...exceptions.map(row)),
    h('h3', null, 'Exact cases ', h('span', { class: 'count' }, exact.length)),
    exact.length === 0
      ? h('p', { class: 'muted' }, 'Nothing stored yet.')
      : h('ul', { class: 'entries' }, ...exact.slice(-LIMIT).reverse().map(row)),
    (exceptions.length > 0 || exact.length > 0) &&
      h('p', { class: 'key' },
        h('i', { class: 'dot dot-explore' }), 'exploring',
        h('i', { class: 'dot dot-goal' }), 'on a plan',
        h('i', { class: 'dot dot-goal dot-surprise' }), 'from a surprise',
        h('span', { class: 'key-used' }, 'used'), 'for the last prediction'),
  );
  return exceptions.length + exact.length;
}
