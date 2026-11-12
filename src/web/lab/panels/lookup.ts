// Knowledge side, derived: how a question is answered from the stored rows.
// For one situation it shows, per action, how many rows apply, which row
// answers, and the prediction that comes out.

import type { Lookup } from '../../../agents/inspect';
import { factCount } from '../../../core/facts';
import type { State } from '../../../core/state';
import { cx, h, put } from '../dom';
import { actionIcon } from '../icons';
import { formatFacts, formatState } from '../words';

export interface LookupProps {
  state: State;
  lookups: Lookup[];
  /** The action of the last move, if it started from this state. */
  taken: string | null;
  /** Finds a stored entry's facts by its key, for naming the row that answered. */
  factsOf(key: string): string;
}

export function renderLookup(el: HTMLElement, props: LookupProps): void {
  const rows = props.lookups.map((lookup) => {
    const { prediction } = lookup;
    const answer = !prediction
      ? h('span', { class: 'muted' }, 'no row applies')
      : h('span', null,
          ...prediction.basis.map((key) => h('span', { class: 'fact' }, props.factsOf(key))),
          h('span', { class: 'muted' },
            prediction.source === 'specific' ? ' has the most facts' : ' its change is added to the state'));
    return h('tr', { class: cx(props.taken === lookup.action && 'is-latest') },
      h('th', { scope: 'row' }, h('span', { class: 'action' }, actionIcon(lookup.action), lookup.action)),
      h('td', { class: 'lk-n' }, lookup.matches.length),
      h('td', { class: 'lk-by' }, answer),
      h('td', { class: 'lk-out' }, prediction ? formatState(prediction.state) : '?'),
    );
  });

  const sample = props.lookups[0];
  put(el,
    h('p', { class: 'lk-rule' },
      `A question is ${factCount(sample?.question ?? {})} facts, such as `,
      h('span', { class: 'fact' }, sample ? formatFacts(sample.question) : ''),
      '. A row applies when all of its facts are in the question. The row with the most facts answers.'),
    h('table', { class: 'lookup' },
      h('thead', null,
        h('tr', null,
          h('th', null, 'Action'),
          h('th', { class: 'lk-n' }, 'Rows apply'),
          h('th', null, 'Answered by'),
          h('th', { class: 'lk-out' }, 'Predicts'))),
      h('tbody', null, ...rows),
    ),
  );
}
