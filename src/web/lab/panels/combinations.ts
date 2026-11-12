// Knowledge side, for an agent that stores every combination of facts.
//
// The store is too large to read as one list, so it is arranged, never
// filtered. On the left, every combination of items that exists, with how
// many rows it has. On the right, all the rows of the one picked. A row is a
// set of facts and how often they were seen together. Beside each fact is how
// often that fact was seen at all, so the two can be compared. No row is
// judged or left out.

import type { Agent } from '../../../agents/agent';
import { timesSeen } from '../../../agents/every-combination/every-combination';
import { factsKey } from '../../../core/facts';
import type { Entry } from '../../../core/knowledge-base';
import type { Summary } from '../../../runs/summary';
import { cx, h, put } from '../dom';
import { formatValue } from '../words';

export interface CombinationsProps {
  agent: Agent;
  summary: Summary;
  /** Keys of the rows the agent's expectation for the last move came from. */
  answered: ReadonlySet<string>;
  /** The combination whose rows are shown, as its item names joined by commas. */
  picked: string | null;
  onPick(id: string): void;
  /** Jump to the move that first wrote a row. */
  onShowMove(move: number): void;
}

interface Combination {
  id: string;
  names: string[];
  rows: Entry[];
  /** Rows first written by the last move. */
  fresh: number;
  /** True when one of its rows gave the agent's expectation for the last move. */
  answered: boolean;
}

const LIMIT = 400;
const idOf = (entry: Entry) => Object.keys(entry.inputs).join(',');

/** Group the stored rows by which items they have. The order never changes as rows are added. */
function arrange(agent: Agent, summary: Summary, answered: ReadonlySet<string>): { items: string[]; combinations: Combination[] } {
  const entries = agent.kb.entries();
  // The first move writes the row holding every item, so its names are all the items there are.
  let items: string[] = [];
  for (const entry of entries) {
    const names = Object.keys(entry.inputs);
    if (names.length > items.length) items = names;
  }

  const byId = new Map<string, Combination>();
  for (const entry of entries) {
    const id = idOf(entry);
    let combination = byId.get(id);
    if (!combination) byId.set(id, (combination = { id, names: Object.keys(entry.inputs), rows: [], fresh: 0, answered: false }));
    combination.rows.push(entry);
  }
  for (const key of answered) byId.get(idOf(agent.kb.get(key)!))!.answered = true;
  for (const write of summary.lastStep?.writes ?? []) {
    if (write.createdEntry) byId.get(idOf(agent.kb.get(write.key)!))!.fresh += 1;
  }

  // Fewest items first. Within that, in the order of the items themselves.
  const place = (c: Combination) => c.names.reduce((sum, name) => sum + 2 ** (items.length - 1 - items.indexOf(name)), 0);
  const combinations = [...byId.values()].sort((a, b) => a.names.length - b.names.length || place(b) - place(a));
  return { items, combinations };
}

export function renderCombinations(
  indexEl: HTMLElement,
  headEl: HTMLElement,
  rowsEl: HTMLElement,
  props: CombinationsProps,
): void {
  const { agent, summary } = props;
  const { items, combinations } = arrange(agent, summary, props.answered);

  if (combinations.length === 0) {
    put(indexEl);
    put(headEl, h('span', { class: 'asking-label' }, 'Empty'));
    put(rowsEl, h('p', { class: 'muted' }, 'Each move writes one row for every combination of what was seen in it.'));
    return;
  }

  const picked = combinations.find((c) => c.id === props.picked) ?? combinations[0]!;
  const touched = new Set(summary.lastStep?.writes.map((write) => write.key) ?? []);

  // Left: every combination that exists.
  put(indexEl,
    h('table', { class: 'combos' },
      h('thead', null,
        h('tr', null,
          ...items.map((name) => h('th', null, name)),
          h('th', { class: 'co-n', title: 'How many different rows this combination has.' }, 'Rows'),
          h('th', { class: 'co-new', title: 'Rows first written by the last move.' }, 'New'),
          h('th', { class: 'co-ans', title: 'A row of this combination gave the expectation for the last move.' }, 'Ans'))),
      h('tbody', null,
        ...combinations.map((c) =>
          h('tr', {
              class: cx(c === picked && 'is-on'),
              tabindex: 0,
              role: 'button',
              'aria-pressed': c === picked,
              title: c.names.join(', '),
              onClick: () => props.onPick(c.id),
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'Enter') props.onPick(c.id);
              },
            },
            ...items.map((name) => h('td', null, c.names.includes(name) && h('i', { class: 'dot' }))),
            h('td', { class: 'co-n' }, c.rows.length),
            h('td', { class: 'co-new' }, c.fresh > 0 && `+${c.fresh}`),
            h('td', { class: 'co-ans' }, c.answered && h('i', { class: 'mark mark-answer' })),
          )),
      ),
    ),
  );

  // Above the rows: which combination this is.
  put(headEl,
    // The names give way if the line is too narrow. The key is always whole.
    h('span', { class: 'asking-where' }, ...picked.names.map((name) => h('span', { class: 'fact' }, name))),
    h('span', { class: 'asking-key' },
      picked.names.length > 1 && h('span', { title: 'The small number beside a fact is how often that fact was seen at all, in any row.' },
        h('i', { class: 'alone alone-key' }, 'n'), 'seen at all'),
      h('span', { title: 'The one row of this combination that the last move added to.' },
        h('i', { class: 'mark mark-match' }), 'written'),
      h('span', { title: 'A row the expectation for the last move came from.' },
        h('i', { class: 'mark mark-answer' }), 'answered')),
  );

  // Right: all the rows of that combination, oldest first, so a new row goes at the end.
  const alone = (name: string, entry: Entry) => {
    const single = agent.kb.get(factsKey({ [name]: entry.inputs[name]! }));
    return single ? timesSeen(single) : 0;
  };
  const row = (entry: Entry) => {
    const origin = summary.origins.get(entry.key);
    return h('tr', { class: cx(touched.has(entry.key) && 'is-touched', props.answered.has(entry.key) && 'is-answer') },
      h('td', { class: 'kb-facts' },
        ...picked.names.map((name) =>
          h('span', { class: 'fact' },
            `${name} = ${formatValue(name, entry.inputs[name]!)}`,
            picked.names.length > 1 && h('i', { class: 'alone' }, alone(name, entry))))),
      h('td', { class: 'kb-count' }, timesSeen(entry)),
      h('td', { class: 'kb-move' },
        origin && h('button', {
          class: cx('chip', `chip-${origin.phase}`, origin.surprise && 'chip-surprise'),
          title: `First written at move ${origin.step}. Click to go there.`,
          onClick: () => props.onShowMove(origin.step),
        }, origin.step)),
    );
  };

  put(rowsEl,
    h('table', { class: 'kb' },
      h('thead', null,
        h('tr', null,
          h('th', null, picked.names.length > 1 ? 'Facts' : 'Fact'),
          h('th', { class: 'kb-count', title: 'How often all the facts of the row were seen together.' }, 'Together'),
          h('th', { class: 'kb-move' }, 'Move'))),
      h('tbody', null, ...picked.rows.slice(0, LIMIT).map(row)),
    ),
    picked.rows.length > LIMIT && h('p', { class: 'muted' }, `Showing the first ${LIMIT} of ${picked.rows.length}.`),
  );
}
