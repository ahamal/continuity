import { Agent } from '../../agent/agent';
import type { AgentEvent } from '../../agent/events';
import { seededRandom } from '../../agent/random';
import { factsKey } from '../../engine/facts';
import type { Scenario } from '../../worlds/scenarios';
import {
  type Action,
  type GridWorld,
  type State,
  formatState,
  stateKey,
} from '../../worlds/world';

export type LogKind = 'note' | 'step' | 'plan' | 'surprise' | 'good' | 'bad';

export interface LogLine {
  text: string;
  kind: LogKind;
}

type Activity = {
  kind: 'explore' | 'goal';
  events: Generator<AgentEvent, unknown>;
};

/**
 * One run of an agent in a scenario, advanced one event at a time so the page
 * can show each step. It also keeps the bookkeeping the page draws from.
 */
export class Session {
  scenario: Scenario;
  seed: number;
  world!: GridWorld;
  agent!: Agent;

  log: LogLine[] = [];
  observations = 0;
  surprises = 0;
  /** True once the agent has finished an exploration. */
  explored = false;
  goal: State | null = null;
  /** The states the current plan expects to pass through. */
  route: State[] = [];
  visited = new Set<string>();
  /** Keys of the knowledge-base entries changed by the latest step. */
  touched = new Set<string>();
  /** Where the latest surprise happened, until the next step. */
  surpriseAt: State | null = null;

  private activity: Activity | null = null;

  constructor(scenario: Scenario, seed: number) {
    this.scenario = scenario;
    this.seed = seed;
    this.reset();
  }

  reset(scenario: Scenario = this.scenario, seed: number = this.seed): void {
    this.scenario = scenario;
    this.seed = seed;
    this.world = scenario.create();
    this.agent = new Agent(this.world, { random: seededRandom(seed) });
    this.log = [];
    this.observations = 0;
    this.surprises = 0;
    this.explored = false;
    this.goal = null;
    this.route = [];
    this.visited = new Set([stateKey(this.world.getState())]);
    this.touched = new Set();
    this.surpriseAt = null;
    this.activity = null;
  }

  get busy(): 'explore' | 'goal' | null {
    return this.activity?.kind ?? null;
  }

  startExplore(): void {
    this.note('Exploring out of curiosity.', 'note');
    this.goal = null;
    this.route = [];
    this.activity = { kind: 'explore', events: this.agent.explore(this.scenario.exploreSteps) };
  }

  startGoal(goal: State): void {
    this.route = [];
    this.activity = { kind: 'goal', events: this.agent.executePlan(goal) };
  }

  /** Advance by one event. Returns false when there was nothing to do. */
  advance(): boolean {
    if (!this.activity) return false;
    const next = this.activity.events.next();
    if (next.done) {
      this.activity = null;
      return false;
    }
    this.handle(next.value);
    return true;
  }

  private handle(event: AgentEvent): void {
    switch (event.type) {
      case 'explore-step':
        this.recordStep(event.from, event.action, event.to);
        this.note(
          `${formatState(event.from)} ${event.action} → ${formatState(event.to)}   curiosity ${event.curiosity.toFixed(2)}`,
          'step',
        );
        break;

      case 'confident':
        this.explored = true;
        this.activity = null;
        this.note(`Confident after ${event.steps} steps. Every action has been seen ${this.agent.confidenceThreshold} times.`, 'good');
        break;

      case 'explore-exhausted':
        this.explored = true;
        this.activity = null;
        this.note(`Stopped exploring after ${event.steps} steps without becoming confident.`, 'bad');
        break;

      case 'goal':
        this.goal = event.goal;
        this.note(`Goal: ${formatState(event.goal)}`, 'note');
        break;

      case 'plan': {
        this.route = this.expectedRoute(event.from, event.path);
        const steps = event.path.length === 1 ? '1 step' : `${event.path.length} steps`;
        const how = event.status === 'success' ? '' : ` (search gave up: ${event.status})`;
        this.note(`Plan from ${formatState(event.from)}: ${steps}${how}`, 'plan');
        break;
      }

      case 'step':
        this.recordStep(event.from, event.action, event.to);
        if (event.surprise) {
          this.surprises += 1;
          this.surpriseAt = event.from;
          this.route = [];
          this.note(
            `${formatState(event.from)} ${event.action} → ${formatState(event.to)}   surprise: expected ${formatState(event.expected!)}`,
            'surprise',
          );
        } else {
          this.route = this.route.slice(1);
          this.note(`${formatState(event.from)} ${event.action} → ${formatState(event.to)}`, 'step');
        }
        break;

      case 'reached':
        this.route = [];
        this.activity = null;
        this.note(`Reached the goal in ${event.steps} steps.`, 'good');
        break;

      case 'no-path':
        this.activity = null;
        this.note('No route found. The agent gave up.', 'bad');
        break;

      case 'max-replans':
        this.activity = null;
        this.note('Gave up after planning ten times.', 'bad');
        break;
    }
  }

  private recordStep(from: State, action: Action, to: State): void {
    this.observations += 1;
    this.surpriseAt = null;
    this.visited.add(stateKey(to));
    this.touched = new Set([
      factsKey({ action }),
      factsKey({ ...this.world.describe(from), action }),
    ]);
  }

  /** The states a plan expects to pass through, according to the agent's own predictions. */
  private expectedRoute(from: State, path: Action[]): State[] {
    const route: State[] = [];
    let state = from;
    for (const action of path) {
      const prediction = this.agent.predict(state, action);
      if (!prediction) break;
      state = prediction.state;
      route.push(state);
    }
    return route;
  }

  private note(text: string, kind: LogKind): void {
    this.log.push({ text, kind });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }
}
