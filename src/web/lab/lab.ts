// The lab: arranges the regions of the screen and hands each one what to show.
//
// Two sides. Left is the state: what is happening. Right is the knowledge:
// what the agent has learned. Each fact is shown once, in one fixed place.
// Each region is drawn by its own file in panels/ or world-views/.

import type { Recipe } from '../../agents/recipes';
import { type State, formatState, sameState } from '../../core/state';
import { summarise } from '../../runs/summary';
import { type Scenario, findScenario } from '../../worlds/scenarios';
import { Controller } from './controller';
import { cx, h, put } from './dom';
import { icon, icons } from './icons';
import { lookupsAt } from '../../agents/inspect';
import { formatFacts } from './words';
import { type Sort, renderKnowledge } from './panels/knowledge';
import { renderLearning } from './panels/learning';
import { renderLookup } from './panels/lookup';
import { renderActivity, renderLastMove } from './panels/state';
import { createTimeline } from './panels/timeline';
import { type WorldView, createWorldView } from './world-views';

export interface LabOptions {
  recipe: Recipe;
  scenarioIds: string[];
  /** Where the world picker, seed and "Start over" go. Usually the page header. */
  setupSlot?: HTMLElement | null;
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
  const knowledgeEl = h('div', { class: 'panel-body panel-scroll' });
  const lookupNameEl = h('span', { class: 'panel-note' });
  const lookupEl = h('div', { class: 'panel-body' });
  const learningEl = h('div', { class: 'panel-body' });
  // Set-up: chosen before a run, so it sits apart from both sides.
  const setupEl = options.setupSlot ?? h('div', { class: 'setup' });

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

  container.replaceChildren(
    h('div', { class: 'lab' },
      !options.setupSlot && setupEl,
      h('div', { class: 'col' },
        panel('state', icons.state, 'State', activityEl,
          worldEl,
          h('p', { class: 'legend' },
            h('span', null, h('i', { class: 'lg lg-visited' }), 'been here'),
            h('span', null, h('i', { class: 'lg lg-blocked' }), 'learned: no way through'),
            h('span', null, h('i', { class: 'lg lg-route' }), 'plan'),
            h('span', null, h('i', { class: 'lg lg-surprise' }), 'surprise')),
          lastMoveEl,
        ),
        h('section', { class: 'panel panel-controls' }, controlsEl, h('div', { class: 'time-row' }, timelineEl, speedEl)),
      ),
      h('div', { class: 'col' },
        panel('entries', icons.entries, 'Knowledge base', kbAsideEl, knowledgeEl),
        panel('lookup', icons.cell, 'Lookup', lookupNameEl, lookupEl),
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
      h('label', { class: 'field', title: 'The seed fixes the random choices, so a run can be repeated exactly.' },
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
    view.update({ run, summary, selected });
    renderLastMove(lastMoveEl, summary);
    renderControls(run.agent.isConfident(), position);
    timeline.update({ events: controller.head.events, cursor: controller.cursor, stops });

    // The situation being looked up: the selected cell, else where the last
    // move started (the question the agent actually asked), else where it is.
    const last = summary.lastStep;
    const situation = selected ?? last?.from ?? position;
    const lookups = lookupsAt(run.agent, situation);
    const matched = new Set(lookups.flatMap((lookup) => lookup.matches.map((entry) => entry.key)));
    const answered = new Set(lookups.flatMap((lookup) => lookup.prediction?.basis ?? []));

    put(kbAsideEl,
      h('span', { class: 'panel-note' }, `${run.agent.kb.size} rows`),
      h('div', { class: 'segmented segmented-small', 'aria-label': 'Order' },
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
    renderKnowledge(knowledgeEl, { agent: run.agent, summary, sort, matched, answered, onShowMove: (move) => seek(afterMove(move)) });

    lookupNameEl.textContent = `at ${formatState(situation)}: ${selected ? 'the selected cell' : last ? 'where the last move started' : 'where the agent is'}`;
    renderLookup(lookupEl, {
      state: situation,
      lookups,
      taken: !selected && last ? last.action : null,
      factsOf: (key) => {
        const entry = run.agent.kb.get(key);
        return entry ? formatFacts(entry.inputs) : key;
      },
    });

    renderLearning(learningEl, { agent: run.agent, summary, possibleMoves: view.states().length * run.agent.actions.length });
  }

  function onKey(event: KeyboardEvent): void {
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
  };
}
