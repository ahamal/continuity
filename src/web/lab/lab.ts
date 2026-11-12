// The lab: arranges the regions of the screen and hands each one what to show.
// Left side is the state (what is happening). Right side is the knowledge
// (what the agent has learned). Each region is drawn by its own file in panels/.

import type { Recipe } from '../../agents/recipes';
import { type State, sameState } from '../../core/state';
import { summarise } from '../../runs/summary';
import { type Scenario, findScenario } from '../../worlds/scenarios';
import { Controller } from './controller';
import { cx, h, put } from './dom';
import { renderCellBeliefs, renderSelection } from './panels/cell';
import { exceptionsIn, renderKnowledge } from './panels/knowledge';
import { renderLearning } from './panels/learning';
import { renderLog } from './panels/log';
import { renderLastMove, renderMode } from './panels/mode';
import { createTimeline } from './panels/timeline';
import { type WorldView, createWorldView } from './world-views';

export interface LabOptions {
  recipe: Recipe;
  scenarioIds: string[];
  /** Notes about the stage, shown in their own tab. */
  notesHtml?: string;
}

type Tab = 'knowledge' | 'notes';
type StateTab = 'move' | 'log';

const SPEEDS: [label: string, perSecond: number][] = [
  ['Slow', 2],
  ['Normal', 6],
  ['Fast', 20],
];

/**
 * The interactive view of one agent in one world. It only arranges the parts
 * and passes them what to show. The run itself lives in the controller, and
 * each region of the screen is drawn by its own module.
 */
export function createLab(container: HTMLElement, options: LabOptions): () => void {
  const scenarios = options.scenarioIds
    .map((id) => findScenario(id))
    .filter((scenario): scenario is Scenario => scenario !== undefined);

  let selected: State | null = null;
  let tab: Tab = 'knowledge';
  let stateTab: StateTab = 'move';
  let view: WorldView;

  // Two sides. Left is the state: what is happening. Right is the knowledge:
  // what the agent has learned. Every region has a fixed place.
  const setupEl = h('div', { class: 'setup' });
  const modeEl = h('section', { class: 'mode', 'aria-live': 'polite' });
  const worldEl = h('div', { class: 'world' });
  const selectionEl = h('div', { class: 'selection' });
  const legendEl = h('div', { class: 'legend' },
    legendItem('lg-agent', 'the agent'),
    legendItem('lg-visited', 'been here'),
    legendItem('lg-unvisited', 'never been here'),
    legendItem('lg-blocked', 'learned: move does nothing'),
    legendItem('lg-route', 'its plan'),
    legendItem('lg-surprise', 'surprise'),
  );
  const stateTabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const stateBodyEl = h('div', { class: 'state-body' });
  const transportEl = h('div', { class: 'transport' });
  const timelineEl = h('div', { class: 'timeline' });
  const learningEl = h('section', { class: 'learning' });
  const beliefsEl = h('section', { class: 'cell-beliefs' });
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const tabBodyEl = h('div', { class: 'tab-body' });

  const controller = new Controller(options.recipe, scenarios[0]!, 1, () => render());
  const timeline = createTimeline(timelineEl, (position) => {
    controller.pause(false);
    controller.seek(position);
  });

  const lab = h('div', { class: 'lab' },
    setupEl,
    h('div', { class: 'lab-main' },
      h('div', { class: 'stage' },
        h('h2', { class: 'side-title' }, 'State', h('span', null, 'what is happening')),
        modeEl,
        h('div', { class: 'world-wrap', onClick: () => select(null) }, worldEl, legendEl),
        selectionEl,
        stateTabsEl,
        stateBodyEl,
        transportEl,
        timelineEl,
      ),
      h('div', { class: 'side' },
        h('h2', { class: 'side-title' }, 'Knowledge', h('span', null, 'what it has learned')),
        learningEl,
        beliefsEl,
        tabsEl,
        tabBodyEl,
      ),
    ),
  );
  container.replaceChildren(lab);

  function select(state: State | null): void {
    selected = state && selected && sameState(state, selected) ? null : state;
    render();
  }

  function mountWorld(): void {
    view = createWorldView(controller.view.world, select);
    worldEl.replaceChildren(view.el);
  }

  function newRun(scenario = controller.scenario, seed = controller.seed): void {
    selected = null;
    controller.reset(scenario, seed);
    mountWorld();
    render();
  }

  function sendTo(goal: State): void {
    selected = null;
    controller.command({ type: 'goal', goal });
  }

  function renderSetup(): void {
    const seed = h('input', {
      class: 'seed', type: 'number', min: 1, value: controller.seed, 'aria-label': 'Seed',
      onChange: (event: Event) => {
        const value = Math.max(1, Math.floor(Number((event.target as HTMLInputElement).value)) || 1);
        newRun(controller.scenario, value);
      },
    });
    put(setupEl,
      scenarios.length > 1 &&
        h('div', { class: 'setup-group' },
          h('span', { class: 'label' }, 'World'),
          h('div', { class: 'segmented' },
            ...scenarios.map((scenario) =>
              h('button', {
                class: cx(scenario === controller.scenario && 'is-on'),
                'aria-pressed': scenario === controller.scenario,
                onClick: () => newRun(scenario),
              }, scenario.label)),
          ),
        ),
      h('p', { class: 'setup-note' }, controller.scenario.description),
      h('div', { class: 'setup-group setup-right' },
        h('label', { class: 'label', title: 'The seed fixes the random choices, so a run can be repeated exactly.' }, 'Seed ', seed),
        h('button', { class: 'btn', onClick: () => newRun() }, 'Start over'),
      ),
    );
  }

  function renderTransport(moves: number, shown: number): void {
    const { atEnd, playing } = controller;
    const stop = (action: () => void) => () => {
      controller.pause(false);
      action();
    };
    put(transportEl,
      h('div', { class: 'transport-buttons' },
        h('button', { class: 'btn', title: 'Back to the start', disabled: controller.cursor === 0, onClick: stop(() => controller.seek(0)) }, '⏮'),
        h('button', { class: 'btn', title: 'One move back (←)', disabled: controller.cursor === 0, onClick: stop(() => controller.back()) }, '◀ Back'),
        h('button', { class: 'btn btn-play', title: 'Play or pause (space)', disabled: atEnd, onClick: () => controller.toggle() }, playing ? '❚❚ Pause' : '▶ Play'),
        h('button', { class: 'btn', title: 'One move forward (→)', disabled: atEnd, onClick: stop(() => controller.forward()) }, 'Step ▶'),
        h('button', { class: 'btn', title: 'Jump to the latest move', disabled: atEnd, onClick: stop(() => controller.seek(Infinity)) }, '⏭'),
      ),
      h('p', { class: 'transport-where' },
        h('strong', null, moves === 0 ? 'No moves yet' : `Move ${shown} of ${moves}`),
        !atEnd && !playing && moves > 0 && h('span', { class: 'muted', title: 'A new command from here replaces what came after.' }, ' · looking at the past')),
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

  function tabButtons<T extends string>(el: HTMLElement, names: [T, string][], current: T, choose: (id: T) => void): void {
    el.replaceChildren(
      ...names.map(([id, label]) =>
        h('button', {
          role: 'tab', 'aria-selected': current === id, class: cx('tab', current === id && 'is-on'),
          onClick: () => {
            choose(id);
            render();
          },
        }, label)),
    );
  }

  function render(): void {
    if (!view) return;
    const run = controller.view;
    const summary = summarise(run.events);
    const moves = controller.head.events.filter((event) => event.type === 'step').length;
    const exceptions = exceptionsIn(run.agent).length;
    const stops = controller.stops();
    const seek = (position: number) => {
      controller.pause(false);
      controller.seek(position);
    };
    /** The position just after move number `move`. */
    const afterMove = (move: number) => {
      let seen = 0;
      const index = controller.head.events.findIndex((event) => event.type === 'step' && ++seen === move);
      return stops.find((stop) => stop > index) ?? controller.head.events.length;
    };

    renderSetup();
    renderMode(modeEl, {
      summary,
      position: run.world.getState(),
      suggested: controller.scenario.goals,
      onExplore: () => controller.command({ type: 'explore' }),
      onGoal: sendTo,
    });
    view.update({ run, summary, selected, suggested: controller.scenario.goals });
    renderTransport(moves, summary.steps.length);
    timeline.update({ events: controller.head.events, cursor: controller.cursor, stops });
    renderLearning(learningEl, {
      agent: run.agent,
      summary,
      possibleMoves: view.states().length * run.agent.actions.length,
      exceptions,
    });
    const cell = {
      state: selected,
      agent: run.agent,
      summary,
      position: run.world.getState(),
      open: selected ? view.isOpen(selected) : false,
      onSend: () => selected && sendTo(selected),
      onClear: () => select(null),
    };
    renderSelection(selectionEl, cell);
    renderCellBeliefs(beliefsEl, cell);

    tabButtons<StateTab>(stateTabsEl, [['move', 'Its last move'], ['log', `Everything that happened (${moves} moves)`]], stateTab, (id) => (stateTab = id));
    if (stateTab === 'move') renderLastMove(stateBodyEl, summary);
    else renderLog(stateBodyEl, { events: controller.head.events, cursor: controller.cursor, stops, onSeek: seek });

    const names: [Tab, string][] = [['knowledge', `Everything it has stored (${run.agent.kb.size} entries)`]];
    if (options.notesHtml) names.push(['notes', 'Notes on this stage']);
    tabButtons<Tab>(tabsEl, names, tab, (id) => (tab = id));
    if (tab === 'knowledge') {
      tabBodyEl.className = 'tab-body';
      renderKnowledge(tabBodyEl, { agent: run.agent, summary, onShowMove: (move) => seek(afterMove(move)) });
    } else {
      tabBodyEl.className = 'tab-body notes';
      tabBodyEl.innerHTML = options.notesHtml ?? '';
    }
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

  mountWorld();
  render();

  return () => {
    controller.dispose();
    document.removeEventListener('keydown', onKey);
  };
}

function legendItem(swatch: string, label: string): HTMLElement {
  return h('span', { class: 'legend-item' }, h('i', { class: `swatch ${swatch}` }), label);
}
