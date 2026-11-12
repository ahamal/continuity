// Knowledge side: what the agent expects each action to do at the selected cell.

import type { Agent } from '../../../agents/agent';
import { beliefsAt } from '../../../agents/inspect';
import type { State } from '../../../core/state';
import { h, put } from '../dom';
import { actionIcon } from '../icons';
import { formatState } from '../words';

export interface CellProps {
  state: State | null;
  agent: Agent;
  /** False for places the agent cannot stand, such as a wall. */
  open: boolean;
}

export function renderCellBeliefs(el: HTMLElement, props: CellProps): void {
  const { state, agent } = props;
  if (!state) {
    put(el, h('p', { class: 'muted' }, 'Click a cell to see what the agent expects there.'));
    return;
  }
  if (!props.open) {
    put(el,
      h('p', { class: 'muted' }, 'A wall. The agent has no entry for it: it only learns which moves do nothing.'));
    return;
  }

  const rows = beliefsAt(agent, state).map((belief) => {
    const prediction = belief.prediction;
    const expects = !prediction ? '?' : belief.blocked ? 'stays' : `→ ${formatState(prediction.state)}`;
    const basis = !prediction ? 'never seen' : prediction.source === 'specific' ? `seen here ×${prediction.count}` : 'assumed';
    return h('tr', { class: prediction?.source === 'specific' ? 'is-seen' : 'is-assumed' },
      h('th', { scope: 'row' }, h('span', { class: 'action' }, actionIcon(belief.action), belief.action)),
      h('td', { class: 'expects' }, expects),
      h('td', { class: 'muted' }, basis),
    );
  });
  put(el, h('table', { class: 'beliefs' }, h('tbody', null, ...rows)));
}
