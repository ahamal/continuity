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

/**
 * The panel always shows one row per action, whether or not a cell is
 * selected, so it keeps the same height and nothing below it moves.
 */
export function renderCellBeliefs(el: HTMLElement, props: CellProps): void {
  const { state, agent } = props;
  const beliefs = state && props.open ? beliefsAt(agent, state) : null;

  const rows = agent.actions.map((action, i) => {
    const belief = beliefs?.[i];
    const prediction = belief?.prediction;
    let expects = '–';
    let basis = !state ? 'click a cell' : 'a wall: nothing stored for it';
    if (belief) {
      expects = !prediction ? '?' : belief.blocked ? 'stays' : `→ ${formatState(prediction.state)}`;
      basis = !prediction ? 'never seen' : prediction.source === 'specific' ? `seen here ×${prediction.count}` : 'assumed';
    }
    return h('tr', { class: prediction?.source === 'specific' ? 'is-seen' : 'is-assumed' },
      h('th', { scope: 'row' }, h('span', { class: 'action' }, actionIcon(action), action)),
      h('td', { class: 'expects' }, expects),
      h('td', { class: 'muted' }, basis),
    );
  });
  put(el, h('table', { class: 'beliefs' }, h('tbody', null, ...rows)));
}
