// Knowledge side: every stored entry, grouped, with where each came from.

import type { Agent } from '../../../agents/agent';
import { type Facts, factCount, factsKey } from '../../../core/facts';
import type { Entry, Outcome } from '../../../core/knowledge-base';
import type { EntryOrigin, Summary } from '../../../runs/summary';
import { cx, h, put } from '../dom';
import { formatFacts } from '../words';

export interface KnowledgeProps {
  agent: Agent;
  summary: Summary;
  /** Jump to the move that created an entry. */
  onShowMove(move: number): void;
}

const LIMIT = 300;

const topOutcome = (entry: Entry, pick: (outcome: Outcome) => boolean): Outcome | null =>
  [...entry.outcomes.values()].filter(pick).sort((a, b) => b.count - a.count)[0] ?? null;

const isChange = (outcome: Outcome) => !Object.hasOwn(outcome.value, 'new_state');

/**
 * Entries that go against the general rule for their action: the specific
 * case saw a different change from the one the action usually causes.
 */
export function exceptionsIn(agent: Agent): { entry: Entry; usual: Facts }[] {
  const found: { entry: Entry; usual: Facts }[] = [];
  for (const entry of agent.kb.entries()) {
    const action = entry.inputs.action;
    if (factCount(entry.inputs) < 2 || action === undefined) continue;
    const general = agent.kb.get(factsKey({ action }));
    const usual = general && topOutcome(general, isChange);
    const here = topOutcome(entry, isChange);
    if (usual && here && factsKey(usual.value) !== factsKey(here.value)) {
      found.push({ entry, usual: usual.value });
    }
  }
  return found;
}

function originLabel(origin: EntryOrigin | undefined): string {
  if (!origin) return '';
  const when = origin.phase === 'explore' ? 'while exploring' : 'on the way to a goal';
  return origin.surprise ? `Learned from a surprise ${when}` : `Learned ${when}`;
}

/** The knowledge base, readable: exceptions first, then everything stored. */
export function renderKnowledge(el: HTMLElement, props: KnowledgeProps): void {
  const { agent, summary } = props;
  const last = summary.lastStep;
  const used = new Set(last?.expected?.basis ?? []);
  const written = new Set(last?.writes.map((write) => write.key) ?? []);

  const row = (entry: Entry, usual?: Facts) => {
    const origin = summary.origins.get(entry.key);
    const outcomes = [...entry.outcomes.values()].sort((a, b) => b.count - a.count);
    return h('li', { class: cx('entry', used.has(entry.key) && 'is-used', written.has(entry.key) && 'is-written') },
      h('span', {
        class: cx('origin', origin && `origin-${origin.phase}`, origin?.surprise && 'origin-surprise'),
        title: originLabel(origin),
      }),
      h('div', { class: 'entry-body' },
        h('div', { class: 'entry-if' }, formatFacts(entry.inputs)),
        ...outcomes.map((outcome) =>
          h('div', { class: 'entry-then' }, h('span', { class: 'arrow' }, '→'), ` ${formatFacts(outcome.value)} `, h('span', { class: 'muted' }, `×${outcome.count}`)),
        ),
        usual && h('div', { class: 'entry-usual' }, `The general rule says ${formatFacts(usual)}.`),
      ),
      h('div', { class: 'entry-meta' },
        used.has(entry.key) && h('span', { class: 'tag tag-used' }, 'used for the last prediction'),
        written.has(entry.key) && h('span', { class: 'tag tag-written' }, 'updated by the last move'),
        origin && h('button', { class: 'link', title: 'Show the move that created this entry', onClick: () => props.onShowMove(origin.step) }, `move ${origin.step}`),
      ),
    );
  };

  const entries = agent.kb.entries();
  const exceptions = exceptionsIn(agent);
  const general = entries.filter((entry) => factCount(entry.inputs) === 1);
  const specific = entries.filter((entry) => factCount(entry.inputs) > 1);

  if (entries.length === 0) {
    el.replaceChildren(h('p', { class: 'empty' }, 'Nothing stored yet. Entries appear here as the agent sees things happen.'));
    return;
  }

  put(el,
    h('div', { class: 'origin-key' },
      h('span', null, h('i', { class: 'origin origin-explore' }), 'learned while exploring'),
      h('span', null, h('i', { class: 'origin origin-goal' }), 'learned on the way to a goal'),
      h('span', null, h('i', { class: 'origin origin-goal origin-surprise' }), 'learned from a surprise'),
    ),
    h('h4', null, `Exceptions `, h('span', { class: 'count' }, exceptions.length)),
    h('p', { class: 'group-note' }, 'Specific cases where the general rule turned out wrong. These override it.'),
    exceptions.length === 0
      ? h('p', { class: 'empty' }, 'None found so far.')
      : h('ul', { class: 'entries' }, ...exceptions.map(({ entry, usual }) => row(entry, usual))),
    h('h4', null, 'General rules ', h('span', { class: 'count' }, general.length)),
    h('p', { class: 'group-note' }, 'What each action does, wherever it is taken.'),
    h('ul', { class: 'entries' }, ...general.map((entry) => row(entry))),
    h('h4', null, 'Exact cases ', h('span', { class: 'count' }, specific.length)),
    h('p', { class: 'group-note' }, 'One entry for every state and action it has seen, newest first.'),
    h('ul', { class: 'entries' }, ...specific.slice(-LIMIT).reverse().map((entry) => row(entry))),
    specific.length > LIMIT && h('p', { class: 'empty' }, `Showing the newest ${LIMIT}.`),
  );
}
