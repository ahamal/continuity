// The selected cell. Two regions: the selection strip under the world (state
// side) and what the agent expects at that cell (knowledge side).

import type { Agent } from '../../../agents/agent';
import { beliefsAt } from '../../../agents/inspect';
import { type State, sameState, stateKey } from '../../../core/state';
import type { Summary } from '../../../runs/summary';
import { h, put } from '../dom';
import { formatState, times } from '../words';

export interface CellProps {
  state: State | null;
  agent: Agent;
  summary: Summary;
  position: State;
  /** False for places the agent cannot stand, such as a wall. */
  open: boolean;
  onSend(): void;
  onClear(): void;
}

/** State side: which cell is selected, and the button to send the agent there. */
export function renderSelection(el: HTMLElement, props: CellProps): void {
  const { state } = props;
  if (!state) {
    put(el, h('span', { class: 'muted' }, 'Click a cell to send the agent there and to see what it expects there.'));
    return;
  }
  const visits = props.summary.visits.get(stateKey(state)) ?? 0;
  const here = sameState(state, props.position);
  const about = !props.open
    ? 'a wall: the agent cannot stand here'
    : here
      ? 'the agent is here'
      : visits > 0
        ? `it has been here ${times(visits)}`
        : 'it has never been here';
  put(el,
    h('strong', null, `Selected ${formatState(state)}`),
    h('span', { class: 'muted' }, about),
    props.open && !here && h('button', { class: 'btn btn-goal', onClick: props.onSend }, 'Send the agent here'),
    h('button', { class: 'btn', onClick: props.onClear }, 'Clear'),
  );
}

/** Knowledge side: what the agent expects each action to do at the selected cell. */
export function renderCellBeliefs(el: HTMLElement, props: CellProps): void {
  const { state, agent } = props;
  el.hidden = !state;
  if (!state) return;

  if (!props.open) {
    put(el,
      h('div', { class: 'panel-head' }, h('h3', null, `What it expects at ${formatState(state)}`)),
      h('p', { class: 'cell-note' }, 'This is a wall. The agent does not know that. It only learns, one move at a time, that stepping this way does nothing.'),
    );
    return;
  }

  const rows = beliefsAt(agent, state).map((belief) => {
    const prediction = belief.prediction;
    let expects: string;
    let basis: string;
    let kind: string;
    if (!prediction) {
      expects = 'no idea';
      basis = 'it has never seen this action';
      kind = 'none';
    } else if (prediction.source === 'specific') {
      expects = belief.blocked ? 'does nothing' : `→ ${formatState(prediction.state)}`;
      basis = `seen here ${times(prediction.count)}`;
      kind = 'seen';
    } else {
      expects = `→ ${formatState(prediction.state)}`;
      basis = 'assumed from the general rule, never tried here';
      kind = 'assumed';
    }
    return h('tr', { class: `belief-${kind}` },
      h('th', { scope: 'row' }, belief.action),
      h('td', { class: 'belief-expects' }, expects),
      h('td', { class: 'belief-basis' }, basis),
      h('td', { class: 'belief-curiosity' }, `curiosity ${belief.curiosity.toFixed(2)}`),
    );
  });

  put(el,
    h('div', { class: 'panel-head' }, h('h3', null, `What it expects at ${formatState(state)}`)),
    h('table', { class: 'beliefs' }, h('tbody', null, ...rows)),
  );
}
