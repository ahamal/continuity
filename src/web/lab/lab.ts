import { beliefsAt, blockedMoves } from '../../agent/inspect';
import { type Facts, type Value, factCount } from '../../engine/facts';
import type { Entry, Outcome } from '../../engine/knowledge-base';
import { type Scenario, findScenario } from '../../worlds/scenarios';
import { type State, formatState, sameState } from '../../worlds/world';
import { Session } from './session';

const SPEEDS = [
  { label: 'Slow', ms: 450 },
  { label: 'Normal', ms: 140 },
  { label: 'Fast', ms: 25 },
];

const ALL_ENTRIES_LIMIT = 300;

/** Side of one grid cell, in drawing units. */
const CELL = 40;

type Tab = 'knowledge' | 'log' | 'cell' | 'notes';

/** Wide screens show the knowledge base in its own column, so it needs no tab. */
const WIDE_QUERY = '(min-width: 1280px)';

let instances = 0;

const TEMPLATE = `
  <div class="lab-bar">
    <div class="tabs" data-scenarios role="group" aria-label="World"></div>
    <div class="lab-actions">
      <button type="button" class="btn btn-primary" data-explore>Explore</button>
      <button type="button" class="btn" data-step>Step</button>
      <button type="button" class="btn" data-pause>Pause</button>
      <button type="button" class="btn" data-reset>Reset</button>
    </div>
    <span class="goal-chips" data-goals></span>
    <div class="lab-settings">
      <label class="field">Seed <input type="number" data-seed min="1" step="1" value="1" /></label>
      <label class="field">Speed <select data-speed></select></label>
    </div>
  </div>

  <div class="lab-body" data-body>
    <section class="world" aria-label="World">
      <div class="plot" data-plot></div>

      <ul class="legend">
        <li><svg viewBox="-7 -7 14 14" aria-hidden="true"><path class="agent-body" d="M0,-6 L6,0 L0,6 L-6,0 Z" /></svg>Agent</li>
        <li><svg viewBox="-7 -7 14 14" aria-hidden="true"><path class="goal-mark" d="M-6,-2 V-6 H-2 M2,-6 H6 V-2 M6,2 V6 H2 M-2,6 H-6 V2" /></svg>Goal</li>
        <li><svg viewBox="-7 -7 14 14" aria-hidden="true"><path class="route-line" d="M-7,0 H7" /></svg>Planned route</li>
        <li><span class="key-wall" aria-hidden="true"></span>Wall</li>
        <li><svg viewBox="-7 -7 14 14" aria-hidden="true"><path class="block-mark" d="M2,-6 H-2 V6 H2" /></svg>Learned: does nothing</li>
        <li><svg viewBox="-7 -7 14 14" aria-hidden="true"><rect class="visited-dot" x="-1.5" y="-1.5" width="3" height="3" /></svg>Visited</li>
      </ul>

      <p class="status" aria-live="polite"><span class="status-tag" data-status-tag></span><span data-status></span></p>
      <dl class="readout" data-stats></dl>
      <div class="meters" data-meters></div>
    </section>

    <h3 class="know-title">Knowledge base</h3>

    <div class="tabs pane-tabs" data-tabs role="group" aria-label="Panel">
      <button type="button" data-tab-btn="knowledge">Knowledge</button>
      <button type="button" data-tab-btn="log">Log</button>
      <button type="button" data-tab-btn="cell">Cell</button>
      <button type="button" data-tab-btn="notes">Notes</button>
    </div>

    <div class="pane pane-knowledge" data-pane="knowledge" data-knowledge></div>
    <div class="pane" data-pane="log"><ol class="log" data-log></ol></div>
    <div class="pane" data-pane="cell" data-beliefs></div>
    <div class="pane notes" data-pane="notes" data-notes></div>
  </div>
`;

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** Four corner brackets around a square, as one path. */
function brackets(x: number, y: number, size: number, arm: number): string {
  const r = x + size;
  const b = y + size;
  return (
    `M${x},${y + arm} V${y} H${x + arm} ` +
    `M${r - arm},${y} H${r} V${y + arm} ` +
    `M${r},${b - arm} V${b} H${r - arm} ` +
    `M${x + arm},${b} H${x} V${b - arm}`
  );
}

/**
 * Build an interactive view of an agent in one or more scenarios inside
 * `container`. `notesHtml` fills the Notes tab. Returns a function that stops it.
 */
export function createLab(container: HTMLElement, scenarioIds: string[], notesHtml = ''): () => void {
  const options: Scenario[] = scenarioIds.map((id) => findScenario(id)!);
  const session = new Session(options[0]!, 1);
  const uid = `lab${++instances}`;
  const wide = window.matchMedia(WIDE_QUERY);

  let selected: State | null = null;
  let timer: number | undefined;
  let speed = SPEEDS[1]!.ms;
  let showAll = false;
  let tab: Tab = wide.matches ? 'log' : 'knowledge';

  container.classList.add('lab');
  container.innerHTML = TEMPLATE;
  const $ = <T extends Element = HTMLElement>(selector: string) => container.querySelector<T>(selector)!;

  const bodyEl = $('[data-body]');
  const scenariosEl = $('[data-scenarios]');
  const seedEl = $<HTMLInputElement>('[data-seed]');
  const speedEl = $<HTMLSelectElement>('[data-speed]');
  const plotEl = $('[data-plot]');
  const statusEl = $('[data-status]');
  const statusTagEl = $('[data-status-tag]');
  const exploreBtn = $<HTMLButtonElement>('[data-explore]');
  const stepBtn = $<HTMLButtonElement>('[data-step]');
  const pauseBtn = $<HTMLButtonElement>('[data-pause]');
  const goalsEl = $('[data-goals]');
  const statsEl = $('[data-stats]');
  const metersEl = $('[data-meters]');
  const beliefsEl = $('[data-beliefs]');
  const knowledgeEl = $('[data-knowledge]');
  const logEl = $('[data-log]');
  const notesEl = $('[data-notes]');

  notesEl.innerHTML = notesHtml;
  const hasNotes = notesHtml.trim() !== '';
  $<HTMLButtonElement>('[data-tab-btn="notes"]').hidden = !hasNotes;

  // Where the grid sits inside the drawing. Set by buildPlot.
  let ox = 0;
  let oy = 0;

  const cellLeft = (x: number) => ox + x * CELL;
  const cellTop = (y: number) => oy + (session.world.height - 1 - y) * CELL;
  const centreX = (x: number) => cellLeft(x) + CELL / 2;
  const centreY = (y: number) => cellTop(y) + CELL / 2;
  const isOutside = (x: number, y: number) =>
    x < 0 || x >= session.world.width || y < 0 || y >= session.world.height;

  /** Like centreX and centreY, but a cell outside the grid is drawn just beyond the frame. */
  function point(x: number, y: number): { px: number; py: number } {
    const { width, height } = session.world;
    const px = x < 0 ? ox - 9 : x >= width ? ox + width * CELL + 9 : centreX(x);
    const py = y >= height ? oy - 9 : y < 0 ? oy + height * CELL + 9 : centreY(y);
    return { px, py };
  }

  // ---- running ----------------------------------------------------------

  const isRunning = () => timer !== undefined;

  function stop(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  }

  function run(): void {
    stop();
    const tick = () => {
      const advanced = session.advance();
      timer = advanced && session.busy ? window.setTimeout(tick, speed) : undefined;
      render();
    };
    timer = window.setTimeout(tick, 0);
  }

  function sendTo(goal: State): void {
    session.startGoal(goal);
    run();
  }

  // ---- tabs -------------------------------------------------------------

  function setTab(next: Tab): void {
    tab = next;
    if (wide.matches && tab === 'knowledge') tab = 'log';
    if (!hasNotes && tab === 'notes') tab = 'log';
    bodyEl.dataset.tab = tab;
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-tab-btn]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tabBtn === tab));
    }
  }

  const onWideChange = () => setTab(tab);

  // ---- building ---------------------------------------------------------

  function buildToolbar(): void {
    scenariosEl.hidden = options.length < 2;
    scenariosEl.innerHTML = '';
    for (const scenario of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = scenario.label;
      button.dataset.id = scenario.id;
      button.addEventListener('click', () => {
        stop();
        selected = null;
        session.reset(scenario, session.seed);
        buildPlot();
        render();
      });
      scenariosEl.append(button);
    }

    speedEl.innerHTML = SPEEDS.map(
      (option) => `<option value="${option.ms}"${option.ms === speed ? ' selected' : ''}>${option.label}</option>`,
    ).join('');
  }

  /** Draw everything about the world that does not change while it runs. */
  function buildPlot(): void {
    const { world } = session;
    const { width, height } = world;
    ox = height > 1 ? 30 : 16;
    oy = 14;
    const fieldW = width * CELL;
    const fieldH = height * CELL;
    const viewW = ox + fieldW + 16;
    const viewH = oy + fieldH + 26;
    const right = ox + fieldW;
    const bottom = oy + fieldH;

    const parts: string[] = [];
    parts.push(`<defs>
      <pattern id="${uid}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line class="hatch-line" x1="0" y1="0" x2="0" y2="6" />
      </pattern>
      <marker id="${uid}-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
        <path class="route-head" d="M0,0.5 L8,4 L0,7.5 Z" />
      </marker>
    </defs>`);

    for (let x = 1; x < width; x++) {
      parts.push(`<line class="grid-line" x1="${cellLeft(x)}" y1="${oy}" x2="${cellLeft(x)}" y2="${bottom}" />`);
    }
    for (let y = 1; y < height; y++) {
      parts.push(`<line class="grid-line" x1="${ox}" y1="${oy + y * CELL}" x2="${right}" y2="${oy + y * CELL}" />`);
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!world.isWall(x, y)) continue;
        const at = `x="${cellLeft(x)}" y="${cellTop(y)}" width="${CELL}" height="${CELL}"`;
        parts.push(`<rect class="wall-base" ${at} /><rect class="wall" ${at} fill="url(#${uid}-hatch)" />`);
      }
    }

    parts.push(`<rect class="field-frame" x="${ox}" y="${oy}" width="${fieldW}" height="${fieldH}" />`);
    parts.push(
      `<path class="crop" d="` +
        `M${ox - 8},${oy} H${ox - 3} M${ox},${oy - 8} V${oy - 3} ` +
        `M${right + 3},${oy} H${right + 8} M${right},${oy - 8} V${oy - 3} ` +
        `M${ox - 8},${bottom} H${ox - 3} M${ox},${bottom + 3} V${bottom + 8} ` +
        `M${right + 3},${bottom} H${right + 8} M${right},${bottom + 3} V${bottom + 8}" />`,
    );

    for (let x = 0; x < width; x++) {
      parts.push(`<text class="axis-label" x="${centreX(x)}" y="${bottom + 16}" text-anchor="middle">${x}</text>`);
    }
    if (height > 1) {
      for (let y = 0; y < height; y++) {
        parts.push(`<text class="axis-label" x="${ox - 9}" y="${centreY(y) + 3}" text-anchor="end">${y}</text>`);
      }
    }

    for (const layer of ['visited', 'blocked', 'route', 'surprise', 'goal', 'selected']) {
      parts.push(`<g data-layer="${layer}"></g>`);
    }
    parts.push(
      `<g class="agent" data-agent>` +
        `<path class="agent-body" d="M0,-12 L12,0 L0,12 L-12,0 Z" />` +
        `<rect class="agent-pip" x="-2" y="-2" width="4" height="4" /></g>`,
    );

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (world.isWall(x, y)) continue;
        parts.push(
          `<rect class="hit" x="${cellLeft(x)}" y="${cellTop(y)}" width="${CELL}" height="${CELL}" ` +
            `data-x="${x}" data-y="${y}" tabindex="0" role="button" ` +
            `aria-label="Cell ${esc(formatState(world.stateAt(x, y)))}" />`,
        );
      }
    }

    plotEl.style.aspectRatio = `${viewW} / ${viewH}`;
    plotEl.style.setProperty('--plot-width', `${viewW}`);
    plotEl.innerHTML =
      `<svg viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="xMinYMin meet" role="group" ` +
      `aria-label="${esc(world.name)}">${parts.join('')}</svg>`;

    goalsEl.innerHTML = '';
    if (session.scenario.goals.length > 0) {
      const label = document.createElement('span');
      label.className = 'goal-label';
      label.textContent = 'Send to';
      goalsEl.append(label);
    }
    for (const goal of session.scenario.goals) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn-chip';
      chip.textContent = formatState(goal);
      chip.addEventListener('click', () => sendTo(goal));
      goalsEl.append(chip);
    }
  }

  // ---- rendering --------------------------------------------------------

  const layer = (name: string) => plotEl.querySelector<SVGGElement>(`[data-layer="${name}"]`)!;

  function renderPlot(): void {
    const { world, agent } = session;
    const at = world.cellOf(world.getState());

    // Cells the agent has been in.
    const visited: string[] = [];
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (!session.visited.has(world.stateAt(x, y).join(','))) continue;
        visited.push(`<rect class="visited-dot" x="${centreX(x) - 1.5}" y="${centreY(y) - 1.5}" width="3" height="3" />`);
      }
    }
    layer('visited').innerHTML = visited.join('');

    // Moves the agent has learned do nothing: a bracket on that side of the cell.
    const blocked: string[] = [];
    for (const move of blockedMoves(agent, world)) {
      const cell = world.cellOf(move.state);
      const l = cellLeft(cell.x);
      const t = cellTop(cell.y);
      const r = l + CELL;
      const b = t + CELL;
      let d = '';
      if (move.action === 'left') d = `M${l + 7},${t + 7} H${l + 3} V${b - 7} H${l + 7}`;
      else if (move.action === 'right') d = `M${r - 7},${t + 7} H${r - 3} V${b - 7} H${r - 7}`;
      else if (move.action === 'up') d = `M${l + 7},${t + 7} V${t + 3} H${r - 7} V${t + 7}`;
      else if (move.action === 'down') d = `M${l + 7},${b - 7} V${b - 3} H${r - 7} V${b - 7}`;
      if (d) blocked.push(`<path class="block-mark" d="${d}" />`);
    }
    layer('blocked').innerHTML = blocked.join('');

    // The plan, as the agent expects it to go. It may leave the grid.
    const route: string[] = [];
    if (session.route.length > 0) {
      const stops = session.route.map((state) => world.cellOf(state));
      const points = [point(at.x, at.y), ...stops.map((cell) => point(cell.x, cell.y))];
      route.push(
        `<polyline class="route-line" marker-end="url(#${uid}-arrow)" ` +
          `points="${points.map((p) => `${p.px},${p.py}`).join(' ')}" />`,
      );
      stops.slice(0, -1).forEach((cell, index) => {
        const p = points[index + 1]!;
        const outside = isOutside(cell.x, cell.y) ? ' is-outside' : '';
        route.push(`<rect class="route-node${outside}" x="${p.px - 2.5}" y="${p.py - 2.5}" width="5" height="5" />`);
      });
    }
    layer('route').innerHTML = route.join('');

    // Where the latest surprise happened.
    let surprise = '';
    if (session.surpriseAt) {
      const cell = world.cellOf(session.surpriseAt);
      const cx = centreX(cell.x);
      const cy = centreY(cell.y);
      const rays: string[] = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        rays.push(
          `M${(cx + cos * 14).toFixed(1)},${(cy + sin * 14).toFixed(1)} ` +
            `L${(cx + cos * 19).toFixed(1)},${(cy + sin * 19).toFixed(1)}`,
        );
      }
      surprise = `<path class="surprise-mark" d="${rays.join(' ')}" />`;
    }
    layer('surprise').innerHTML = surprise;

    let goal = '';
    if (session.goal) {
      const cell = world.cellOf(session.goal);
      const cx = centreX(cell.x);
      const cy = centreY(cell.y);
      goal =
        `<path class="goal-mark" d="${brackets(cellLeft(cell.x) + 5, cellTop(cell.y) + 5, CELL - 10, 8)}" />` +
        `<path class="goal-mark goal-cross" d="M${cx - 3},${cy} H${cx + 3} M${cx},${cy - 3} V${cy + 3}" />`;
    }
    layer('goal').innerHTML = goal;

    let chosen = '';
    if (selected) {
      const cell = world.cellOf(selected);
      chosen = `<path class="select-mark" d="${brackets(cellLeft(cell.x) + 1.5, cellTop(cell.y) + 1.5, CELL - 3, 7)}" />`;
    }
    layer('selected').innerHTML = chosen;

    const agentEl = plotEl.querySelector<SVGGElement>('[data-agent]')!;
    agentEl.style.transform = `translate(${centreX(at.x)}px, ${centreY(at.y)}px)`;
    plotEl.style.setProperty('--glide', `${Math.min(Math.round(speed * 0.8), 160)}ms`);
  }

  function renderControls(): void {
    const confident = session.agent.isConfident();
    const busy = session.busy;

    for (const button of scenariosEl.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.id === session.scenario.id));
    }

    exploreBtn.disabled = confident || busy === 'explore';
    stepBtn.disabled = !busy && confident;
    pauseBtn.disabled = !busy;
    pauseBtn.textContent = busy && !isRunning() ? 'Resume' : 'Pause';

    let tag: string;
    let status: string;
    if (busy === 'explore') {
      tag = isRunning() ? 'explore' : 'paused';
      status = isRunning() ? 'Exploring out of curiosity.' : 'Exploring, paused.';
    } else if (busy === 'goal') {
      tag = isRunning() ? 'goal' : 'paused';
      status = `Heading to ${formatState(session.goal ?? [])}${isRunning() ? '.' : ', paused.'}`;
    } else if (session.observations === 0) {
      tag = 'blank';
      status = 'The agent knows nothing yet. Press Explore.';
    } else if (confident) {
      tag = 'ready';
      status = 'Confident. Send it somewhere, or select a cell to see what it expects there.';
    } else {
      tag = 'unsure';
      status = 'Not confident yet. Press Explore to continue.';
    }
    statusTagEl.textContent = tag;
    statusTagEl.dataset.state = tag;
    statusEl.textContent = status;

    statsEl.innerHTML = [
      ['Observations', session.observations],
      ['Entries', session.agent.kb.size],
      ['Surprises', session.surprises],
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join('');

    const threshold = session.agent.confidenceThreshold;
    metersEl.innerHTML =
      `<p class="meters-title">Sightings per action, trusted at ${threshold}</p>` +
      session.world.actions
        .map((action) => {
          const count = session.agent.generalCount(action);
          const segments = Array.from(
            { length: threshold },
            (_, i) => `<i class="${i < count ? 'on' : ''}"></i>`,
          ).join('');
          return `<div class="meter${count >= threshold ? ' full' : ''}">
            <span class="meter-name">${esc(action)}</span>
            <span class="meter-bar" aria-hidden="true">${segments}</span>
            <span class="meter-count">${count}</span>
          </div>`;
        })
        .join('');
  }

  function renderBeliefs(): void {
    if (!selected) {
      beliefsEl.innerHTML = '<p class="hint">Select a cell in the drawing to see what the agent expects there.</p>';
      return;
    }
    const { world, agent } = session;
    const cellState = selected;
    const isHere = sameState(cellState, world.getState());

    const rows = beliefsAt(agent, cellState)
      .map((belief) => {
        let expects: string;
        let basis: string;
        if (!belief.prediction) {
          expects = '<span class="muted">no idea</span>';
          basis = '<span class="muted">nothing seen</span>';
        } else {
          const target = world.cellOf(belief.prediction.state);
          expects = belief.blocked
            ? '<span class="tag tag-blocked">stays put</span>'
            : esc(formatState(belief.prediction.state)) +
              (isOutside(target.x, target.y) ? ' <span class="tag tag-outside">outside the grid</span>' : '');
          basis =
            belief.prediction.source === 'specific'
              ? `seen here ×${belief.prediction.count}`
              : `general rule ×${belief.prediction.count}`;
        }
        return `<tr><th scope="row">${esc(belief.action)}</th><td>${expects}</td><td>${basis}</td></tr>`;
      })
      .join('');

    beliefsEl.innerHTML = `
      <div class="beliefs-head">
        <h4 class="group-title">At ${esc(formatState(cellState))} the agent expects</h4>
        <button type="button" class="btn btn-chip" data-send ${isHere ? 'disabled' : ''}>Send agent here</button>
      </div>
      <table class="beliefs-table">
        <thead><tr><th scope="col">Action</th><th scope="col">Result</th><th scope="col">Based on</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    beliefsEl.querySelector('[data-send]')!.addEventListener('click', () => sendTo(cellState));
  }

  function formatValue(name: string, value: Value): string {
    if (typeof value === 'object') return formatState(value);
    if (typeof value === 'number' && session.world.diffKeys.includes(name) && value > 0) return `+${value}`;
    return String(value);
  }

  function formatFacts(facts: Facts): string {
    return Object.keys(facts)
      .sort()
      .map(
        (name) =>
          `<span class="fact"><span class="fact-name">${esc(name)}</span>` +
          `<span class="fact-eq">=</span>${esc(formatValue(name, facts[name]!))}</span>`,
      )
      .join('');
  }

  /** Outcomes that are alternatives to each other describe the same fact names. */
  function renderOutcomes(entry: Entry): string {
    const groups = new Map<string, Outcome[]>();
    for (const outcome of entry.outcomes.values()) {
      const signature = Object.keys(outcome.value).sort().join(',');
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature)!.push(outcome);
    }

    const parts: string[] = [];
    for (const group of groups.values()) {
      const ordered = [...group].sort((a, b) => b.count - a.count);
      ordered.forEach((outcome, index) => {
        const alternative = ordered.length > 1;
        const used = alternative && index === 0;
        parts.push(
          `<span class="outcome${alternative && !used ? ' outcome-minor' : ''}">${formatFacts(outcome.value)}` +
            `<span class="count">×${outcome.count}</span>${used ? '<span class="tag tag-used">used</span>' : ''}</span>`,
        );
      });
    }
    return parts.join('');
  }

  function renderEntry(entry: Entry): string {
    const touched = session.touched.has(entry.key) ? ' is-touched' : '';
    return `<li class="entry${touched}">
      <span class="entry-inputs">${formatFacts(entry.inputs)}</span>
      <span class="entry-arrow" aria-hidden="true">→</span>
      <span class="entry-outcomes">${renderOutcomes(entry)}</span>
    </li>`;
  }

  /** A specific entry is an exception when its change differs from what the action usually does. */
  function isException(entry: Entry): boolean {
    const { agent, world } = session;
    const action = entry.inputs.action;
    if (typeof action !== 'string') return false;
    for (const outcome of entry.outcomes.values()) {
      for (const name of world.diffKeys) {
        if (!Object.hasOwn(outcome.value, name)) continue;
        const usual = agent.kb.query(name, { action });
        if (usual && usual.value !== outcome.value[name]) return true;
      }
    }
    return false;
  }

  function renderKnowledge(): void {
    const entries = session.agent.kb.entries();
    if (entries.length === 0) {
      knowledgeEl.innerHTML = '<p class="hint">Nothing yet. The knowledge base is empty.</p>';
      return;
    }

    const general = entries.filter((entry) => factCount(entry.inputs) === 1);
    const exceptions = entries.filter((entry) => factCount(entry.inputs) > 1 && isException(entry));

    const group = (title: string, note: string, items: Entry[], empty: string) => `
      <div class="entry-group">
        <h4 class="group-title">${title}<span class="group-count">${items.length}</span></h4>
        <p class="hint">${note}</p>
        ${items.length ? `<ul class="entries">${items.map(renderEntry).join('')}</ul>` : `<p class="hint">${empty}</p>`}
      </div>`;

    let all = '';
    if (showAll) {
      const newest = [...entries].reverse().slice(0, ALL_ENTRIES_LIMIT);
      const cut = entries.length > newest.length ? `<p class="hint">Showing the newest ${newest.length}.</p>` : '';
      all = `${cut}<ul class="entries">${newest.map(renderEntry).join('')}</ul>`;
    }

    const scrollTop = knowledgeEl.scrollTop;
    knowledgeEl.innerHTML =
      group('General rules', 'What each action does, wherever it is taken.', general, 'None yet.') +
      group(
        'Exceptions',
        'Exact cases where the result differed from the general rule.',
        exceptions,
        'None yet. They appear when the agent runs into something.',
      ) +
      `<details class="entry-group" data-all ${showAll ? 'open' : ''}>
        <summary class="group-title">All entries<span class="group-count">${entries.length}</span></summary>
        ${all}
      </details>`;
    knowledgeEl.scrollTop = scrollTop;

    knowledgeEl.querySelector<HTMLDetailsElement>('[data-all]')!.addEventListener('toggle', (event) => {
      const open = (event.currentTarget as HTMLDetailsElement).open;
      if (open !== showAll) {
        showAll = open;
        renderKnowledge();
      }
    });
  }

  function renderLog(): void {
    if (session.log.length === 0) {
      logEl.innerHTML = '<li class="hint">Nothing has happened yet.</li>';
      return;
    }
    logEl.innerHTML = session.log
      .map((line) => `<li class="log-${line.kind}">${esc(line.text)}</li>`)
      .join('');
    const pane = logEl.parentElement!;
    pane.scrollTop = pane.scrollHeight;
  }

  function render(): void {
    renderPlot();
    renderControls();
    renderBeliefs();
    renderKnowledge();
    renderLog();
  }

  // ---- wiring -----------------------------------------------------------

  function selectCell(target: EventTarget | null): void {
    const hit = (target as Element | null)?.closest<SVGElement>('.hit');
    if (!hit) return;
    selected = session.world.stateAt(Number(hit.dataset.x), Number(hit.dataset.y));
    setTab('cell');
    renderPlot();
    renderBeliefs();
  }

  plotEl.addEventListener('click', (event) => selectCell(event.target));
  plotEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectCell(event.target);
  });

  $('[data-tabs]').addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-tab-btn]');
    if (button) setTab(button.dataset.tabBtn as Tab);
  });

  exploreBtn.addEventListener('click', () => {
    session.startExplore();
    run();
  });

  stepBtn.addEventListener('click', () => {
    stop();
    if (!session.busy) session.startExplore();
    session.advance();
    render();
  });

  pauseBtn.addEventListener('click', () => {
    if (isRunning()) {
      stop();
      render();
    } else if (session.busy) {
      run();
    }
  });

  $('[data-reset]').addEventListener('click', () => {
    stop();
    selected = null;
    session.reset();
    render();
  });

  seedEl.addEventListener('change', () => {
    const seed = Math.max(1, Math.floor(Number(seedEl.value)) || 1);
    seedEl.value = String(seed);
    stop();
    selected = null;
    session.reset(session.scenario, seed);
    render();
  });

  speedEl.addEventListener('change', () => {
    speed = Number(speedEl.value);
    if (isRunning()) run();
  });

  wide.addEventListener('change', onWideChange);

  buildToolbar();
  buildPlot();
  setTab(tab);
  render();

  return () => {
    stop();
    wide.removeEventListener('change', onWideChange);
  };
}
