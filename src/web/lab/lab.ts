import type { Recipe } from '../../agents/recipes';
import { type State, sameState } from '../../core/state';
import { summarise } from '../../runs/summary';
import { type Scenario, findScenario } from '../../worlds/scenarios';
import { Controller } from './controller';
import { cx, h, put } from './dom';
import { cellCard } from './panels/cell-card';
import { exceptionsIn, renderKnowledge } from './panels/knowledge';
import { renderLearning } from './panels/learning';
import { renderLog } from './panels/log';
import { renderMode } from './panels/mode';
import { createTimeline } from './panels/timeline';
import { type WorldView, createWorldView } from './world-views';

export interface LabOptions {
  recipe: Recipe;
  scenarioIds: string[];
  /** Notes about the stage, shown in their own tab. */
  notesHtml?: string;
}

type Tab = 'knowledge' | 'log' | 'notes';

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
  let view: WorldView;

  // Regions, in the order you meet them: set-up, what it is doing, the world
  // and time on the left, what it knows on the right.
  const setupEl = h('div', { class: 'setup' });
  const modeEl = h('section', { class: 'mode', 'aria-live': 'polite' });
  const worldEl = h('div', { class: 'world' });
  const cardEl = h('div', { class: 'card-slot' });
  const legendEl = h('div', { class: 'legend' },
    legendItem('lg-agent', 'the agent'),
    legendItem('lg-visited', 'been here'),
    legendItem('lg-unvisited', 'never been here: only predicted'),
    legendItem('lg-blocked', 'learned: this move does nothing'),
    legendItem('lg-route', 'the plan it is following'),
    legendItem('lg-surprise', 'surprise'),
  );
  const transportEl = h('div', { class: 'transport' });
  const timelineEl = h('div', { class: 'timeline' });
  const learningEl = h('section', { class: 'learning' });
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const tabBodyEl = h('div', { class: 'tab-body' });

  const controller = new Controller(options.recipe, scenarios[0]!, 1, () => render());
  const timeline = createTimeline(timelineEl, (position) => {
    controller.pause(false);
    controller.seek(position);
  });

  const lab = h('div', { class: 'lab' },
    setupEl,
    modeEl,
    h('div', { class: 'lab-main' },
      h('div', { class: 'stage' },
        h('div', { class: 'world-wrap', onClick: () => select(null) }, worldEl, cardEl),
        legendEl,
        transportEl,
        timelineEl,
      ),
      h('div', { class: 'side' }, learningEl, tabsEl, tabBodyEl),
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
      h('p', { class: 'transport-where' }, h('strong', null, moves === 0 ? 'No moves yet' : `Move ${shown} of ${moves}`)),
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
      !atEnd && !playing && moves > 0 &&
        h('p', { class: 'past-note' }, 'You are looking at the past. A new command from here replaces what came after.'),
    );
  }

  function renderTabs(entries: number): void {
    const names: [Tab, string][] = [
      ['knowledge', `Everything it has stored (${entries})`],
      ['log', 'What happened'],
    ];
    if (options.notesHtml) names.push(['notes', 'Notes']);
    tabsEl.replaceChildren(
      ...names.map(([id, label]) =>
        h('button', {
          role: 'tab', 'aria-selected': tab === id, class: cx('tab', tab === id && 'is-on'),
          onClick: () => {
            tab = id;
            render();
          },
        }, label)),
    );
  }

  function renderCard(summary: ReturnType<typeof summarise>): void {
    cardEl.replaceChildren();
    if (!selected) return;
    const state = selected;
    const card = cellCard({
      state,
      agent: controller.view.agent,
      summary,
      position: controller.view.world.getState(),
      open: view.isOpen(state),
      onSend: () => sendTo(state),
      onClose: () => select(null),
    });
    card.addEventListener('click', (event) => event.stopPropagation());
    cardEl.append(card);

    // Put the card beside the cell, on whichever side has room.
    const cell = view.rectOf(state);
    const wrap = cardEl.parentElement!.getBoundingClientRect();
    if (!cell) return;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    // The card may reach over the panel on the right. It must not cover the cell.
    const right = cell.right - wrap.left + 10;
    const fitsRight = cell.right + 10 + width <= window.innerWidth - 8;
    const left = fitsRight ? right : cell.left - wrap.left - width - 10;
    const top = Math.max(0, Math.min(cell.top - wrap.top - 8, wrap.height - height));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
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
      entries: run.agent.kb.size,
      onExplore: () => controller.command({ type: 'explore' }),
      onGoal: sendTo,
    });
    view.update({ run, summary, selected, suggested: controller.scenario.goals });
    renderCard(summary);
    renderTransport(moves, summary.steps.length);
    timeline.update({ events: controller.head.events, cursor: controller.cursor, stops });
    renderLearning(learningEl, {
      agent: run.agent,
      summary,
      possibleMoves: view.states().length * run.agent.actions.length,
      exceptions,
    });
    renderTabs(run.agent.kb.size);

    if (tab === 'knowledge') {
      tabBodyEl.className = 'tab-body';
      renderKnowledge(tabBodyEl, { agent: run.agent, summary, onShowMove: (move) => seek(afterMove(move)) });
    } else if (tab === 'log') {
      tabBodyEl.className = 'tab-body';
      renderLog(tabBodyEl, { events: controller.head.events, cursor: controller.cursor, stops, onSeek: seek });
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
