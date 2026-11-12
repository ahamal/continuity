// What the agent expects of each action in one cell, and the stored row that
// says so. It answers "why is there a bar here?": click a cell, read the row.

import type { Agent } from '../../../agents/agent';
import { type State, sameState } from '../../../core/state';
import { h, put } from '../dom';
import { actionIcon } from '../icons';
import { formatState, formatValue } from '../words';

export interface ReasonsProps {
  agent: Agent;
  /** The cell being asked about. */
  state: State;
}

export function renderReasons(headEl: HTMLElement, el: HTMLElement, props: ReasonsProps): void {
  const { agent, state } = props;
  put(headEl, h('span', { class: 'asking-where' }, `At ${formatState(state)}. Click a cell to ask about it.`));

  const rows = agent.actions.map((action) => {
    const prediction = agent.predict(state, action);
    // A prediction can rest on more than one row, such as one for each part of the change.
    const entries = (prediction?.basis ?? []).flatMap((key) => agent.kb.get(key) ?? []);
    return h('tr', null,
      h('td', { class: 're-what' },
        h('span', { class: 'action' }, actionIcon(action), action),
        h('div', { class: 're-expects' },
          !prediction ? 'expects nothing' : sameState(prediction.state, state) ? 'nothing happens' : `→ ${formatState(prediction.state)}`)),
      h('td', null,
        ...(entries.length > 0
          ? entries.map((entry) =>
              h('div', null,
                ...Object.keys(entry.inputs).map((name) =>
                  h('span', { class: 'fact' }, `${name} = ${formatValue(name, entry.inputs[name]!)}`))))
          : [h('span', { class: 'muted' }, 'no row')])),
    );
  });

  put(el,
    h('table', { class: 'kb reasons' },
      h('thead', null, h('tr', null, h('th', null, 'It expects'), h('th', null, 'Because of'))),
      h('tbody', null, ...rows)),
  );
}
