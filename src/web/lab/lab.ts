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
import { renderCellBeliefs } from './panels/cell';
import { renderKnowledge } from './panels/knowledge';
import { renderLearning, renderLevel } from './panels/learning';
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

  // State side.
  const activityEl = h('p', { class: 'headline', 'aria-live': 'polite' });
  const worldEl = h('div', { class: 'world', onClick: () => select(null) });
  const lastMoveEl = h('p', { class: 'last-move' });
  const controlsEl = h('div', { class: 'controls' });
  const timelineEl = h('div', { class: 'timeline' });
  // Knowledge side.
  const levelEl = h('p', { class: 'headline' });
  const learningEl = h('section', { class: 'block' });
  const cellEl = h('section', { class: 'block' });
  const knowledgeEl = h('section', { class: 'block block-fill' });
  // Set-up: chosen before a run, so it sits apart from both sides.
  const setupEl = options.setupSlot ?? h('div', { class: 'setup' });

  const controller = new Controller(options.recipe, scenarios[0]!, 1, () => render());
  const seek = (position: number) => {
    controller.pause(false);
    controller.seek(position);
  };
  const timeline = createTimeline(timelineEl, seek);

  container.replaceChildren(
    h('div', { class: 'lab' },
      !options.setupSlot && setupEl,
      h('section', { class: 'side side-state' },
        h('p', { class: 'side-name' }, 'State'),
        activityEl,
        worldEl,
        h('p', { class: 'legend' },
          h('i', { class: 'lg lg-visited' }), 'been here',
          h('i', { class: 'lg lg-blocked' }), 'learned: no way through',
          h('i', { class: 'lg lg-route' }), 'plan',
          h('i', { class: 'lg lg-surprise' }), 'surprise'),
        lastMoveEl,
        controlsEl,
        timelineEl,
      ),
      h('section', { class: 'side side-knowledge' },
        h('p', { class: 'side-name' }, 'Knowledge'),
        levelEl,
        learningEl,
        cellEl,
        knowledgeEl,
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
      h('label', { title: 'The seed fixes the random choices, so a run can be repeated exactly.' },
        'Seed ',
        h('input', {
          class: 'seed', type: 'number', min: 1, value: controller.seed,
          onChange: (event: Event) => {
            const value = Math.floor(Number((event.target as HTMLInputElement).value)) || 1;
            newRun(controller.scenario, Math.max(1, value));
          },
        })),
      h('button', { class: 'btn', onClick: () => newRun() }, 'Start over'),
    );
  }

  /** Every control in one row: what to ask of the agent, then moving through time. */
  function renderControls(confident: boolean, position: State): void {
    const { atEnd, playing, cursor } = controller;
    const paused = (action: () => void) => () => {
      controller.pause(false);
      action();
    };
    const target = selected && view.isOpen(selected) && !sameState(selected, position) ? selected : null;

    put(controlsEl,
      h('button', {
        class: cx('btn', !confident && 'btn-primary'),
        disabled: confident,
        title: confident ? 'It is already confident in every action.' : 'Let it act out of curiosity until it is confident.',
        onClick: () => controller.command({ type: 'explore' }),
      }, 'Explore'),
      h('button', {
        class: cx('btn', target && 'btn-primary'),
        disabled: !target,
        title: 'Click a cell, then send the agent there.',
        onClick: () => {
          if (!target) return;
          selected = null;
          controller.command({ type: 'goal', goal: target });
        },
      }, target ? `Send to ${formatState(target)}` : 'Send to a cell'),
      h('span', { class: 'gap' }),
      h('button', { class: 'btn', title: 'Back to the start', disabled: cursor === 0, onClick: paused(() => controller.seek(0)) }, '⏮'),
      h('button', { class: 'btn', title: 'One move back (←)', disabled: cursor === 0, onClick: paused(() => controller.back()) }, '◀'),
      h('button', { class: 'btn btn-play', title: 'Play or pause (space)', disabled: atEnd, onClick: () => controller.toggle() }, playing ? 'Pause' : 'Play'),
      h('button', { class: 'btn', title: 'One move forward (→)', disabled: atEnd, onClick: paused(() => controller.forward()) }, '▶'),
      h('button', { class: 'btn', title: 'Jump to the latest move', disabled: atEnd, onClick: paused(() => controller.seek(Infinity)) }, '⏭'),
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

    renderLevel(levelEl, run.agent);
    renderLearning(learningEl, { agent: run.agent, summary, possibleMoves: view.states().length * run.agent.actions.length });
    renderCellBeliefs(cellEl, { state: selected, agent: run.agent, open: selected ? view.isOpen(selected) : false });
    renderKnowledge(knowledgeEl, { agent: run.agent, summary, onShowMove: (move) => seek(afterMove(move)) });
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
