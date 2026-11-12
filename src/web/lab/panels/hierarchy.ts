// Knowledge side, for an agent that holds a hierarchy of rows.
//
// One block per action. The top row says what the action does. Indented under
// it are its exceptions, each of which speaks in its place where it applies.
// Beside every row is how many different moves it speaks for and how many of
// those went as it says. When the two are equal the row holds.

import type { Facts } from '../../../core/facts';
import { cx, h, put } from '../dom';
import { actionIcon } from '../icons';
import { formatValue } from '../words';

/** One row of a hierarchy, with its exceptions. Each agent that has one supplies it in this shape. */
export interface Row {
  id: string;
  facts: Facts;
  change: Facts;
  /** How many different moves it speaks for itself. */
  reach: number;
  /** How many of those went as it says. */
  holds: number;
  exceptions: Row[];
}

export interface HierarchyProps {
  /** The top rows, in the order to show them. */
  rows: Row[];
  /** How many different moves they were built from. */
  moves: number;
  /** Ids of the rows to mark as speaking: for the selected cell, or for the last move. */
  answered: ReadonlySet<string>;
  /** The row that was clicked, if any. The world shows the cells it speaks for. */
  picked: string | null;
  onPick(id: string): void;
}

const LIMIT = 300;

const chips = (facts: Facts, skip: Facts = {}) =>
  Object.keys(facts)
    .filter((name) => !Object.hasOwn(skip, name))
    .map((name) => h('span', { class: 'fact' }, `${name} = ${formatValue(name, facts[name]!)}`));

/** `headEl` gets the one line above the table, `asideEl` the totals, `el` the rows. */
export function renderHierarchy(asideEl: HTMLElement, headEl: HTMLElement, el: HTMLElement, props: HierarchyProps): void {
  const roots = props.rows;
  const rowCount = (rows: readonly Row[]): number => rows.reduce((sum, row) => sum + 1 + rowCount(row.exceptions), 0);

  put(asideEl,
    h('span', { class: 'panel-note' }, `${rowCount(roots)} rows · ${props.moves} moves`));
  put(headEl,
    h('span', { class: 'asking-where' }, 'Click a row to see the cells it speaks for.'),
    h('span', { class: 'asking-key' },
      h('span', { title: 'The row that speaks for the selected cell, or that spoke for the last move.' },
        h('i', { class: 'mark mark-answer' }), 'speaks')),
  );

  if (roots.length === 0) {
    put(el, h('p', { class: 'muted' }, 'Empty. The first move with an action gives that action its first row.'));
    return;
  }

  // Whole top rows, until about LIMIT lines are shown.
  const shown: Row[] = [];
  let lineCount = 0;
  for (const root of roots) {
    if (shown.length > 0 && lineCount + rowCount([root]) > LIMIT) break;
    shown.push(root);
    lineCount += rowCount([root]);
  }

  /** A row, then its exceptions one level deeper. `above` is the row it is an exception to. */
  const lines = (row: Row, depth: number, above: Row | null): HTMLElement[] => [
    h('tr', {
        class: cx(props.answered.has(row.id) && 'is-answer', row.holds < row.reach && 'is-broken', props.picked === row.id && 'is-picked'),
        title: 'Click to see the cells this row speaks for.',
        onClick: () => props.onPick(row.id),
      },
      h('td', { class: 'hi-when', style: `padding-left: ${8 + depth * 22}px` },
        above
          ? h('span', null, h('span', { class: 'hi-except' }, 'at'), ...chips(row.facts, above.facts))
          : Object.hasOwn(row.facts, 'action')
            ? h('span', { class: 'action' }, actionIcon(String(row.facts.action)), String(row.facts.action))
            : h('span', null, ...chips(row.facts))),
      h('td', { class: 'hi-then' }, ...chips(row.change)),
      h('td', { class: 'kb-count', title: 'Of the different moves this row speaks for, how many went as it says.' },
        `${row.holds} of ${row.reach}`),
    ),
    ...row.exceptions.flatMap((exception) => lines(exception, depth + 1, row)),
  ];

  put(el,
    h('table', { class: 'kb hierarchy' },
      h('thead', null,
        h('tr', null,
          h('th', null, 'When'),
          h('th', null, 'Then'),
          h('th', { class: 'kb-count' }, 'Holds'))),
      ...shown.map((root) => h('tbody', null, ...lines(root, 0, null))),
    ),
    shown.length < roots.length &&
      h('p', { class: 'muted' }, `Showing the first ${shown.length} of ${roots.length} general rows, with the specific rows under them.`),
  );
}
