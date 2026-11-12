// The lab: arranges the regions of the screen and hands each one what to show.
//
// Two sides. Left is the state: what is happening. Right is the knowledge:
// what the agent has learned. Each fact is shown once, in one fixed place.
// Each region is drawn by its own file in panels/ or world-views/.

import type { Recipe } from '../../agents/recipes';
import { type State, formatState, sameState } from '../../core/state';
import type { Run } from '../../runs/run';
import { summarise } from '../../runs/summary';
import { type Scenario, findScenario } from '../../worlds/scenarios';
import { Controller } from './controller';
import { cx, h, put } from './dom';
import { icon, icons } from './icons';
import { lookupsAt } from '../../agents/inspect';
import { renderCombinations } from './panels/combinations';
import { type Row, renderHierarchy } from './panels/hierarchy';
import { type Sort, renderAsking, renderKnowledge } from './panels/knowledge';
import { renderLearning } from './panels/learning';
import { renderReasons } from './panels/reasons';
import { renderActivity, renderLastMove } from './panels/state';
import { createTimeline } from './panels/timeline';
import { type WorldView, createWorldView } from './world-views';

export interface LabOptions {
  recipe: Recipe;
  scenarioIds: string[];
  /** Where the world picker, seed and "Start over" go. Usually the page header. */
  setupSlot?: HTMLElement | null;
  /** For `knowledge: 'hierarchy'`: reads the agent's hierarchy and how many moves it rests on. */
  hierarchy?: (agent: Run['agent']) => { rows: Row[]; moves: number };
  /** What the agent writes down on each move, in one sentence. Shown above the knowledge base. */
  stores?: string;
  /** How it answers a question from that, in one sentence. */
  answers?: string;
  /**
   * How the knowledge base is laid out. `rows`: one table of every row, for an
   * agent that stores few. `combinations`: rows grouped by which items they
   * have, for an agent that stores every combination. `hierarchy`: the rows
   * an agent has built for each action, with their exceptions under them.
   * `reasons`: for one cell, what it expects of each action and the row that
   * says so.
   */
  knowledge?: 'rows' | 'combinations' | 'hierarchy' | 'reasons' | 'none';
  /**
   * True for a lab placed inside a written page. It is smaller and shows less:
   * the world with its controls, and what the agent holds beside it. No seed,
   * no speed, no confidence panel. Its keys work only after it is clicked, so
   * they do not take over scrolling the page.
   */
  compact?: boolean;
  /** Heading over what the agent holds, in a compact lab. */
  holdsTitle?: string;
  /** Which "this move does nothing" beliefs the world shows. See `Scene.stays`. */
  stays?: 'seen' | 'expected';
  /** Which row's count decides trust, in words. It depends on the agent. */
  trustedRow?: string;
  /** Replaces the sentence about trust, for an agent whose confidence is not a fixed count. */
  confidenceNote?: string;
}

const SPEEDS: [label: string, perSecond: number][] = [
  ['Slow', 2],
  ['Normal', 6],
  ['Fast', 20],
];

export function createLab(container: HTMLElement, options: LabOptions): () => void {
  const scenarios = options.scenarioIds
    .map((id) => findScenario(id))
    .filter((scenario): scenario is Scenario => scenario !== undefined);

  let selected: State | null = null;
  let view: WorldView;
  let sort: Sort = 'written';
  const grouped = options.knowledge === 'combinations';
  /** The combination whose rows are shown, when the knowledge base is grouped. */
  let picked: string | null = null;
  /** The row of a hierarchy that was clicked: the world shows the cells it speaks for. */
  let pickedRow: string | null = null;
  const compact = options.compact === true;

  // State side.
  const activityEl = h('span', { class: 'pill', 'aria-live': 'polite' });
  const worldEl = h('div', { class: 'world', onClick: () => select(null) });
  const lastMoveEl = h('p', { class: 'last-move' });
  const controlsEl = h('div', { class: 'toolbar' });
  const timelineEl = h('div', { class: 'timeline' });
  const speedEl = h('div', { class: 'group' });
  // Knowledge side.
  // First what is stored, then what the code reads out of it.
  const kbAsideEl = h('span', { class: 'panel-aside' });
  const askingEl = h('p', { class: 'asking' });
  const knowledgeEl = h('div', { class: 'panel-body panel-scroll' });
  // Used instead of `knowledgeEl` when the knowledge base is grouped: the
  // combinations on the left, the rows of the picked one on the right. Each
  // scrolls by itself and is kept between moves, so it stays where it was.
  const combosEl = h('div', { class: 'split-index' });
  const combosRowsEl = h('div', { class: 'panel-body split-rows' });
  const learningEl = h('div', { class: 'panel-body' });
  // Set-up: chosen before a run, so it sits apart from both sides.
  const setupEl = options.setupSlot ?? h('div', { class: 'setup' });

  // The same two lines on every page: what this agent writes down, and how it
  // answers from it. They are what differs between the pages.
  const whatEl = h('dl', { class: 'kb-what' },
    h('dt', null, 'Stores'), h('dd', { title: options.stores }, options.stores),
    h('dt', null, 'Answers'), h('dd', { title: options.answers }, options.answers));
  const knowledgeBody = grouped
    ? [h('div', { class: 'split' }, combosEl, h('div', { class: 'split-main' }, askingEl, combosRowsEl))]
    : [askingEl, knowledgeEl];

  /** A titled box. Every region of the lab is one of these. */
  const panel = (name: string, symbol: Parameters<typeof icon>[0], title: string, aside: HTMLElement | null, ...body: HTMLElement[]) =>
    h('section', { class: `panel panel-${name}` },
      h('header', { class: 'panel-head' }, icon(symbol, 16), h('h2', null, title), aside),
      ...body,
    );

  const controller = new Controller(options.recipe, scenarios[0]!, 1, () => render());
  const seek = (position: number) => {
    controller.pause(false);
    controller.seek(position);
  };
  const timeline = createTimeline(timelineEl, seek);

  if (compact) {
    // Inside a written page: the world and its controls, and what the agent holds beside it.
    container.replaceChildren(
      h('div', { class: cx('lab', 'lab-compact', options.knowledge === 'none' && 'lab-solo') },
        h('div', { class: 'col' },
          h('section', { class: 'panel panel-state' },
            h('div', { class: 'compact-top' }, setupEl, activityEl),
            worldEl,
            lastMoveEl),
          h('section', { class: 'panel panel-controls' }, controlsEl, h('div', { class: 'time-row' }, timelineEl)),
        ),
        options.knowledge !== 'none' &&
          h('div', { class: 'col' },
            h('section', { class: 'panel panel-entries' },
              h('header', { class: 'panel-head' }, h('h2', null, options.holdsTitle ?? 'Knowledge base'), kbAsideEl),
              ...knowledgeBody)),
      ),
    );
  } else container.replaceChildren(
    h('div', { class: cx('lab', grouped && 'lab-grouped') },
      !options.setupSlot && setupEl,
      h('div', { class: 'col' },
        panel('state', icons.state, 'State', activityEl,
          worldEl,
          h('p', { class: 'legend' },
            h('span', null, h('i', { class: 'lg lg-visited' }), 'been here'),
            h('span', null, h('i', { class: 'lg lg-blocked' }), options.stays === 'expected' ? 'expects no way through' : 'learned: no way through'),
            h('span', null, h('i', { class: 'lg lg-route' }), 'plan'),
            h('span', null, h('i', { class: 'lg lg-surprise' }), 'surprise')),
          lastMoveEl,
        ),
        h('section', { class: 'panel panel-controls' }, controlsEl, h('div', { class: 'time-row' }, timelineEl, speedEl)),
      ),
      h('div', { class: 'col' },
        panel('entries', icons.entries, 'Knowledge base', kbAsideEl, whatEl, ...knowledgeBody),
        panel('learning', icons.knowledge, 'Confidence', h('span', { class: 'panel-note' }, 'derived'), learningEl),
      ),
    ),
  );

  function select(state: State | null): void {
    selected = state && selected && sameState(state, selected) ? null : state;
    render();
  }

  function newRun(scenario = controller.scenario, seed = controller.seed): void {
    selected = null;
    pickedRow = null;
    controller.reset(scenario, seed);
    view = createWorldView(controller.view.world, select);
    worldEl.replaceChildren(view.el);
    render();
  }

  function renderSetup(): void {
    put(setupEl,
      scenarios.length > 1 &&
        h('div', { class: 'segmented' },
          ...scenarios.map((scenario) =>
            h('button', {
              class: cx(scenario === controller.scenario && 'is-on'),
              'aria-pressed': scenario === controller.scenario,
              onClick: () => newRun(scenario),
            }, scenario.label)),
        ),
      !compact && h('label', { class: 'field', title: 'The seed fixes the random choices, so a run can be repeated exactly.' },
        icon(icons.seed, 15), 'Seed',
        h('input', {
          class: 'seed', type: 'number', min: 1, value: controller.seed,
          onChange: (event: Event) => {
            const value = Math.floor(Number((event.target as HTMLInputElement).value)) || 1;
            newRun(controller.scenario, Math.max(1, value));
          },
        })),
      h('button', { class: 'btn', onClick: () => newRun() }, icon(icons.restart, 15), 'Start over'),
    );
  }

  /** Every control in one bar: what to ask of the agent, then moving through time. */
  function renderControls(confident: boolean, position: State): void {
    const { atEnd, playing, cursor } = controller;
    const paused = (action: () => void) => () => {
      controller.pause(false);
      action();
    };
    const target = selected && view.isOpen(selected) && !sameState(selected, position) ? selected : null;
    const iconButton = (symbol: Parameters<typeof icon>[0], title: string, disabled: boolean, onClick: () => void) =>
      h('button', { class: 'btn btn-icon', title, 'aria-label': title, disabled, onClick }, icon(symbol, 16));

    put(controlsEl,
      h('div', { class: 'group' },
        h('button', {
          class: cx('btn', 'btn-explore', !confident && 'is-ready'),
          disabled: confident,
          title: confident ? 'It is already confident in every action.' : 'Let it act out of curiosity until it is confident.',
          onClick: () => controller.command({ type: 'explore' }),
        }, icon(icons.explore, 16), 'Explore'),
        h('button', {
          class: cx('btn', 'btn-send', target && 'is-ready'),
          disabled: !target,
          title: 'Click a cell, then send the agent there.',
          onClick: () => {
            if (!target) return;
            selected = null;
            controller.command({ type: 'goal', goal: target });
          },
        }, icon(icons.send, 16), target ? `Send to ${formatState(target)}` : 'Send to a cell'),
      ),
      h('div', { class: 'group group-transport' },
        iconButton(icons.toStart, 'Back to the start', cursor === 0, paused(() => controller.seek(0))),
        iconButton(icons.back, 'One move back (←)', cursor === 0, paused(() => controller.back())),
        h('button', {
          class: 'btn btn-play', title: 'Play or pause (space)', 'aria-label': playing ? 'Pause' : 'Play', disabled: atEnd,
          onClick: () => controller.toggle(),
        }, icon(playing ? icons.pause : icons.play, 18)),
        iconButton(icons.forward, 'One move forward (→)', atEnd, paused(() => controller.forward())),
        iconButton(icons.toEnd, 'Jump to the latest move', atEnd, paused(() => controller.seek(Infinity))),
      ),
    );

    put(speedEl,
      h('span', { class: 'field', title: 'Playback speed' }, icon(icons.speed, 15)),
      h('div', { class: 'segmented segmented-small', 'aria-label': 'Speed' },
        ...SPEEDS.map(([label, speed]) =>
          h('button', {
            class: cx(controller.speed === speed && 'is-on'),
            onClick: () => {
              controller.setSpeed(speed);
              render();
            },
          }, label)),
      ),
    );
  }

  /** The knowledge base as one table, marked for the situation being asked about. */
  function renderRows(run: Controller['view'], summary: ReturnType<typeof summarise>, position: State, onShowMove: (move: number) => void): void {
    // The situation the table is marked for: the selected cell, else where the
    // last move started (the question the agent actually asked), else where it is.
    const last = summary.lastStep;
    const situation = selected ?? last?.from ?? position;
    const lookups = lookupsAt(run.agent, situation);
    const matched = new Set(lookups.flatMap((lookup) => lookup.matches.map((entry) => entry.key)));
    const answered = new Set(lookups.flatMap((lookup) => lookup.prediction?.basis ?? []));

    put(kbAsideEl,
      h('span', { class: 'panel-note' }, `${run.agent.kb.size} rows`),
      !compact && h('div', { class: 'segmented segmented-small', 'aria-label': 'Order' },
        ...([['written', 'Newest first'], ['facts', 'Fewest facts first']] as [Sort, string][]).map(([id, label]) =>
          h('button', {
            class: cx(sort === id && 'is-on'),
            onClick: () => {
              sort = id;
              render();
            },
          }, label)),
      ),
    );
    renderKnowledge(knowledgeEl, { agent: run.agent, summary, sort, matched, answered, onShowMove });

    renderAsking(askingEl, {
      facts: run.agent.representation.describe(situation),
      where: selected ? 'the selected cell' : last ? 'where the last move started' : 'where the agent is',
    });
  }

  function render(): void {
    if (!view) return;
    const run = controller.view;
    const summary = summarise(run.events);
    const position = run.world.getState();
    const stops = controller.stops();
    /** The position just after move number `move`. */
    const afterMove = (move: number) => {
      let seen = 0;
      const index = controller.head.events.findIndex((event) => event.type === 'step' && ++seen === move);
      return stops.find((stop) => stop > index) ?? controller.head.events.length;
    };

    renderSetup();

    renderActivity(activityEl, summary, position);
    // The cells the clicked row speaks for: where it gives the agent's expectation for its action.
    const spoken = pickedRow === null
      ? []
      : view.states().filter((state) =>
          run.agent.actions.some((action) => run.agent.predict(state, action)?.basis.includes(pickedRow!)));
    view.update({ run, summary, selected, stays: options.stays ?? 'seen', spoken });
    renderLastMove(lastMoveEl, summary);
    renderControls(run.agent.isConfident(), position);
    timeline.update({ events: controller.head.events, cursor: controller.cursor, stops });

    const onShowMove = (move: number) => seek(afterMove(move));
    if (options.knowledge === 'reasons') {
      put(kbAsideEl);
      renderReasons(askingEl, knowledgeEl, { agent: run.agent, state: selected ?? position });
    } else if (options.knowledge === 'hierarchy') {
      renderHierarchy(kbAsideEl, askingEl, knowledgeEl, {
        ...options.hierarchy!(run.agent),
        // The rows that speak for the selected cell, or else the row that spoke for the last move.
        answered: new Set(
          selected
            ? run.agent.actions.flatMap((action) => run.agent.predict(selected!, action)?.basis ?? [])
            : (summary.lastStep?.expected?.basis ?? []),
        ),
        picked: pickedRow,
        onPick: (id) => {
          pickedRow = pickedRow === id ? null : id;
          render();
        },
      });
    } else if (grouped) {
      put(kbAsideEl, h('span', { class: 'panel-note' }, `${run.agent.kb.size} rows`));
      renderCombinations(combosEl, askingEl, combosRowsEl, {
        agent: run.agent,
        summary,
        answered: new Set(summary.lastStep?.expected?.basis ?? []),
        picked,
        onPick: (id) => {
          picked = id;
          combosRowsEl.scrollTop = 0;
          render();
        },
        onShowMove,
      });
    } else {
      renderRows(run, summary, position, onShowMove);
    }

    renderLearning(learningEl, {
      agent: run.agent,
      summary,
      possibleMoves: view.states().length * run.agent.actions.length,
      trustedRow: options.trustedRow ?? "the action's one-fact row",
      note: options.confidenceNote,
    });
  }

  // Inside a written page, the lab is in use from a click inside it until a click outside it.
  let inUse = !compact;
  function onPointer(event: PointerEvent): void {
    if (compact) inUse = container.contains(event.target as Node);
  }
  document.addEventListener('pointerdown', onPointer);

  function onKey(event: KeyboardEvent): void {
    if (!inUse) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName)) return;
    if (event.key === 'ArrowRight') {
      controller.pause(false);
      controller.forward();
    } else if (event.key === 'ArrowLeft') {
      controller.pause(false);
      controller.back();
    } else if (event.key === ' ') {
      controller.toggle();
    } else if (event.key === 'Escape') {
      select(null);
    } else {
      return;
    }
    event.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  newRun();

  return () => {
    controller.dispose();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPointer);
  };
}
