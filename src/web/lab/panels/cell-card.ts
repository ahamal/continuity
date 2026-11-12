import type { Agent } from '../../../agents/agent';
import { beliefsAt } from '../../../agents/inspect';
import { type State, sameState, stateKey } from '../../../core/state';
import type { Summary } from '../../../runs/summary';
import { h } from '../dom';
import { formatState, times } from '../words';

export interface CellCardProps {
  state: State;
  agent: Agent;
  summary: Summary;
  position: State;
  /** False for places the agent cannot stand, such as a wall. */
  open: boolean;
  onSend(): void;
  onClose(): void;
}

/** A card shown beside a cell: what the agent expects there, and the button to send it. */
export function cellCard(props: CellCardProps): HTMLElement {
  const { state, agent, summary } = props;
  const visits = summary.visits.get(stateKey(state)) ?? 0;
  const here = sameState(state, props.position);

  const head = h('div', { class: 'card-head' },
    h('strong', null, `Cell ${formatState(state)}`),
    h('span', { class: 'muted' }, here ? 'the agent is here' : visits > 0 ? `been here ${times(visits)}` : 'never been here'),
    h('button', { class: 'card-close', 'aria-label': 'Close', onClick: props.onClose }, '×'),
  );

  if (!props.open) {
    return h('div', { class: 'cell-card' }, head,
      h('p', { class: 'card-note' }, 'This is a wall. The agent cannot stand here. It does not know that: it only learns, one move at a time, that stepping this way does nothing.'));
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
      basis = `assumed from the general rule`;
      kind = 'assumed';
    }
    return h('tr', { class: `belief-${kind}` },
      h('th', { scope: 'row' }, belief.action),
      h('td', { class: 'belief-expects' }, expects),
      h('td', { class: 'belief-basis' }, basis),
    );
  });

  return h('div', { class: 'cell-card' },
    head,
    h('button', { class: 'btn btn-goal card-send', disabled: here, onClick: props.onSend },
      here ? 'The agent is already here' : 'Send the agent here'),
    h('p', { class: 'label' }, 'What it expects each action to do here'),
    h('table', { class: 'beliefs' }, h('tbody', null, ...rows)),
  );
}
