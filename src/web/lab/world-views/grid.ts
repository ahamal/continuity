// The drawing for grid worlds (the line and the 2D grid).

import { blockedMoves, expectedStays } from '../../../agents/inspect';
import { type State, sameState, stateKey } from '../../../core/state';
import { type GridWorld, openStates } from '../../../worlds/world';
import { s } from '../dom';
import type { Scene, WorldView } from './index';

const CELL = 40;
/** Room on the left and bottom for the axis numbers. */
const AXIS = 26;
/** Room on the other sides, where routes that leave the grid are drawn. */
const PAD = 16;

/** A grid drawn as cells, with y increasing upward. */
export function createGridView(
  grid: GridWorld,
  onSelect: (state: State | null) => void,
): WorldView {
  const flat = grid.height === 1;
  const left = flat ? PAD : AXIS;
  const width = left + grid.width * CELL + PAD;
  const height = PAD + grid.height * CELL + AXIS;

  const cellX = (x: number) => left + x * CELL;
  const cellY = (y: number) => PAD + (grid.height - 1 - y) * CELL;
  /** Centre of a cell. Cells outside the grid are pulled in to its margin. */
  const centre = (state: State): [number, number] => {
    const { x, y } = grid.cellOf(state);
    const cx = Math.max(-0.3, Math.min(grid.width - 0.7, x)) * CELL + left + CELL / 2;
    const cy = PAD + (grid.height - 1 - Math.max(-0.3, Math.min(grid.height - 0.7, y))) * CELL + CELL / 2;
    return [cx, cy];
  };
  const inside = (state: State) => {
    const { x, y } = grid.cellOf(state);
    return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
  };

  const svg = s('svg', {
    class: 'grid-view',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${grid.name}, ${grid.width} by ${grid.height}`,
  });
  svg.append(
    s('defs', null,
      s('pattern', { id: 'wall-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
        s('rect', { class: 'wall-hatch-line', width: 2.2, height: 6 }),
      ),
    ),
  );

  const layer = (name: string) => {
    const g = s('g', { class: `layer-${name}` });
    svg.append(g);
    return g;
  };
  const visited = layer('visited');
  const cells = layer('cells');
  const axis = layer('axis');
  const trail = layer('trail');
  const blocked = layer('blocked');
  const route = layer('route');
  const marks = layer('marks');
  const agentLayer = layer('agent');
  const hits = layer('hits');

  const hitByKey = new Map<string, SVGElement>();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const wall = grid.isWall(x, y);
      cells.append(
        s('rect', { class: wall ? 'cell is-wall' : 'cell', x: cellX(x), y: cellY(y), width: CELL, height: CELL }),
      );
      const state = grid.stateAt(x, y);
      const hit = s('rect', {
        class: 'cell-hit',
        x: cellX(x),
        y: cellY(y),
        width: CELL,
        height: CELL,
        onClick: (event: Event) => {
          event.stopPropagation();
          onSelect(state);
        },
      });
      hit.append(s('title', null, wall ? `Wall at (${state.join(', ')})` : `(${state.join(', ')})`));
      hitByKey.set(stateKey(state), hit);
      hits.append(hit);
    }
  }
  cells.append(
    s('rect', { class: 'grid-frame', x: left, y: PAD, width: grid.width * CELL, height: grid.height * CELL }),
  );
  for (let x = 0; x < grid.width; x++) {
    axis.append(s('text', { x: cellX(x) + CELL / 2, y: PAD + grid.height * CELL + 16, 'text-anchor': 'middle' }, x));
  }
  if (!flat) {
    for (let y = 0; y < grid.height; y++) {
      axis.append(s('text', { x: left - 9, y: cellY(y) + CELL / 2 + 4, 'text-anchor': 'end' }, y));
    }
  }

  const open = openStates(grid);
  const agentMark = s('g', { class: 'agent' },
    s('circle', { class: 'agent-halo', r: 15 }),
    s('path', { class: 'agent-body', d: 'M0,-11 L11,0 L0,11 L-11,0 Z' }),
  );
  agentLayer.append(agentMark);

  function update(scene: Scene): void {
    const { run, summary } = scene;
    const position = run.world.getState();

    // Cells the agent has stood in.
    visited.replaceChildren();
    for (const state of open) {
      if (!summary.visits.has(stateKey(state))) continue;
      const { x, y } = grid.cellOf(state);
      visited.append(s('rect', { class: 'visited', x: cellX(x), y: cellY(y), width: CELL, height: CELL }));
    }

    // Every move so far, coloured by what was driving the agent.
    trail.replaceChildren();
    for (const step of summary.steps) {
      if (sameState(step.from, step.to)) continue;
      const [x1, y1] = centre(step.from);
      const [x2, y2] = centre(step.to);
      trail.append(s('line', { class: `trail trail-${step.phase}`, x1, y1, x2, y2 }));
    }

    // Moves the agent has learned do nothing: a bar on the side it cannot pass.
    blocked.replaceChildren();
    for (const move of scene.stays === 'expected' ? expectedStays(run.agent, open) : blockedMoves(run.agent, open)) {
      if (!move.wouldBe) continue;
      const from = grid.cellOf(move.state);
      const to = grid.cellOf(move.wouldBe);
      const dx = Math.sign(to.x - from.x);
      const dy = Math.sign(to.y - from.y);
      if (dx === 0 && dy === 0) continue;
      const cx = cellX(from.x) + CELL / 2 + (dx * CELL) / 2;
      const cy = cellY(from.y) + CELL / 2 - (dy * CELL) / 2;
      const half = CELL / 2 - 5;
      blocked.append(
        s('line', {
          class: 'blocked-bar',
          x1: cx - (dy !== 0 ? half : 0),
          y1: cy - (dx !== 0 ? half : 0),
          x2: cx + (dy !== 0 ? half : 0),
          y2: cy + (dx !== 0 ? half : 0),
        }),
      );
    }

    // The rest of the plan: where the agent expects to go.
    route.replaceChildren();
    if (summary.plan) {
      const ahead = summary.plan.states.slice(summary.planProgress);
      if (ahead.length > 0) {
        const points = [position, ...ahead].map((state) => centre(state).join(',')).join(' ');
        route.append(s('polyline', { class: 'route', points }));
        for (const state of ahead) {
          if (inside(state)) continue;
          const [x, y] = centre(state);
          route.append(s('circle', { class: 'route-outside', cx: x, cy: y, r: 2.5 }));
        }
      }
    }

    marks.replaceChildren();
    const goal = 'goal' in summary.mode ? summary.mode.goal : null;
    if (goal) {
      const [x, y] = centre(goal);
      marks.append(
        s('circle', { class: 'goal-ring', cx: x, cy: y, r: 13 }),
        s('circle', { class: 'goal-dot', cx: x, cy: y, r: 3.5 }),
      );
    }
    // Surprises: a cross on the side of the cell where the move was stopped.
    for (const step of summary.surpriseSteps) {
      if (!step.expected) continue;
      const [x1, y1] = centre(step.to);
      const [x2, y2] = centre(step.expected.state);
      const latest = step === summary.lastStep;
      const x = (x1 + x2) / 2;
      const y = (y1 + y2) / 2;
      marks.append(
        s('path', {
          class: latest ? 'surprise-mark is-latest' : 'surprise-mark',
          d: `M${x - 5},${y - 5} L${x + 5},${y + 5} M${x + 5},${y - 5} L${x - 5},${y + 5}`,
        }),
      );
    }
    if (scene.selected) {
      const { x, y } = grid.cellOf(scene.selected);
      marks.append(s('rect', { class: 'selected', x: cellX(x) + 1.5, y: cellY(y) + 1.5, width: CELL - 3, height: CELL - 3 }));
    }

    // The agent is one element that slides to its new place.
    const [ax, ay] = centre(position);
    const phase = summary.mode.kind === 'exploring' ? 'explore' : summary.mode.kind === 'heading' ? 'goal' : 'idle';
    agentMark.setAttribute('class', `agent agent-${phase}`);
    agentMark.style.transform = `translate(${ax}px, ${ay}px)`;
  }

  return {
    el: svg,
    update,
    rectOf: (state) => hitByKey.get(stateKey(state))?.getBoundingClientRect() ?? null,
    states: () => open,
    isOpen: (state) => {
      const { x, y } = grid.cellOf(state);
      return !grid.isWall(x, y);
    },
  };
}
