import type { Agent } from '../../../agents/agent';
import { factsKey } from '../../../core/facts';
import type { Summary } from '../../../runs/summary';
import { cx, h } from '../dom';
import { formatFacts } from '../words';

export interface LearningProps {
  agent: Agent;
  summary: Summary;
  /** How many different moves exist in this world, if that can be counted. */
  possibleMoves: number | null;
  exceptions: number;
}

/** How far along the agent is: what it trusts, and how much of that it has tried itself. */
export function renderLearning(el: HTMLElement, props: LearningProps): void {
  const { agent, summary } = props;
  const confidence = agent.confidence();
  const trusted = confidence.filter((row) => row.seen >= row.needed).length;
  const last = summary.lastStep;

  const rows = confidence.map((row) => {
    const done = row.seen >= row.needed;
    const curiosity = row.seen === 0 ? 1 : done ? 0 : 1 / row.seen;
    const entry = agent.kb.get(factsKey({ action: row.action }));
    const outcomes = entry
      ? [...entry.outcomes.values()].sort((a, b) => b.count - a.count)
      : [];

    const pips = h('span', { class: 'pips', title: `Seen ${row.seen} times. Trusted after ${row.needed}.` });
    for (let i = 0; i < row.needed; i++) {
      pips.append(h('i', { class: i < row.seen ? 'is-on' : '' }));
    }

    return h('tr', { class: cx(done && 'is-trusted', last?.action === row.action && 'is-latest') },
      h('th', { scope: 'row' }, row.action),
      h('td', { class: 'learn-pips' }, pips, h('span', { class: 'learn-count' }, row.seen >= row.needed ? `${row.seen} seen` : `${row.seen} of ${row.needed}`)),
      h('td', { class: 'learn-state' }, done ? 'trusted' : row.seen === 0 ? 'never tried' : 'still curious'),
      h('td', { class: 'learn-curiosity' }, curiosity.toFixed(2)),
      h('td', { class: 'learn-rule' },
        outcomes.length === 0
          ? h('span', { class: 'muted' }, 'nothing yet')
          : h('span', null,
              ...outcomes.flatMap((outcome, i) => [
                i > 0 && h('span', { class: 'muted' }, '  ·  '),
                h('span', { class: i > 0 ? 'muted' : '' }, `${formatFacts(outcome.value)} ×${outcome.count}`),
              ]),
            ),
      ),
    );
  });

  const tried = summary.tried.size;
  const coverage = h('div', { class: 'coverage' });
  if (props.possibleMoves) {
    const share = Math.min(1, tried / props.possibleMoves);
    coverage.append(
      h('div', { class: 'coverage-bar', role: 'img', 'aria-label': `${tried} of ${props.possibleMoves} moves tried` },
        h('i', { style: `width:${(share * 100).toFixed(1)}%` })),
      h('p', { class: 'coverage-text' },
        h('strong', null, `${tried} of ${props.possibleMoves}`),
        ' possible moves it has made itself. ',
        tried === 0
          ? 'It can predict none of the others yet.'
          : `The other ${props.possibleMoves - tried} it predicts from the general rules above, without having tried them.`,
        props.exceptions > 0
          ? ` It has found ${props.exceptions} ${props.exceptions === 1 ? 'place' : 'places'} where a general rule is wrong.`
          : ''),
    );
  }

  el.replaceChildren(
    h('div', { class: 'panel-head' },
      h('h3', null, 'How much it knows'),
      h('span', { class: cx('learn-total', trusted === confidence.length && 'is-done') },
        `${trusted} of ${confidence.length} actions trusted`),
    ),
    h('table', { class: 'learn-table' },
      h('thead', null,
        h('tr', null,
          h('th', null, 'Action'),
          h('th', null, 'Times seen'),
          h('th', null, ''),
          h('th', { title: 'How much it wants to try this action somewhere new. 1 is most, 0 is none.' }, 'Curiosity'),
          h('th', null, 'General rule: what it does'),
        ),
      ),
      h('tbody', null, ...rows),
    ),
    coverage,
  );
}
