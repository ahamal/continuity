import type { ActionConfidence } from '../agents/parts';
import { type State, stateKey } from '../core/state';
import type { Phase, RunEvent, StepEvent } from './events';

/** What the agent is doing at one point in a run. */
export type Mode =
  | { kind: 'blank' }
  | { kind: 'exploring' }
  | { kind: 'explored'; steps: number; confident: boolean }
  | { kind: 'heading'; goal: State }
  | { kind: 'reached'; goal: State; steps: number }
  | { kind: 'failed'; goal: State; steps: number; reason: 'no path' | 'max replans' };

/** How a knowledge base entry first came to exist. */
export interface EntryOrigin {
  phase: Phase;
  /** True when the move that created it went against the agent's prediction. */
  surprise: boolean;
  /** Which move created it, counting from 1. */
  step: number;
}

export type PlanEvent = Extract<RunEvent, { type: 'plan' }>;

/** Everything a view needs that can be worked out from a run's events alone. */
export interface Summary {
  mode: Mode;
  steps: StepEvent[];
  exploreSteps: number;
  goalSteps: number;
  /** Moves that went against a prediction, by what was driving the agent. */
  surprises: { explore: number; goal: number };
  /** How many times each state was stood in, by state key. */
  visits: Map<string, number>;
  /** Moves the agent has made itself, as `stateKey|action`. */
  tried: Set<string>;
  surpriseSteps: StepEvent[];
  origins: Map<string, EntryOrigin>;
  lastStep: StepEvent | null;
  /** The plan being followed, if the agent is heading to a goal. */
  plan: PlanEvent | null;
  /** How many moves of that plan have been made. */
  planProgress: number;
  /** How many plans fell back to stepping greedily. */
  greedyPlans: number;
  confidence: ActionConfidence[] | null;
}

export function summarise(events: readonly RunEvent[]): Summary {
  const summary: Summary = {
    mode: { kind: 'blank' },
    steps: [],
    exploreSteps: 0,
    goalSteps: 0,
    surprises: { explore: 0, goal: 0 },
    visits: new Map(),
    tried: new Set(),
    surpriseSteps: [],
    origins: new Map(),
    lastStep: null,
    plan: null,
    planProgress: 0,
    greedyPlans: 0,
    confidence: null,
  };
  const visit = (state: State) =>
    summary.visits.set(stateKey(state), (summary.visits.get(stateKey(state)) ?? 0) + 1);

  for (const event of events) {
    switch (event.type) {
      case 'explore':
        summary.mode = { kind: 'exploring' };
        summary.plan = null;
        break;
      case 'confident':
        summary.mode = { kind: 'explored', steps: event.steps, confident: true };
        break;
      case 'explore-exhausted':
        summary.mode = { kind: 'explored', steps: event.steps, confident: false };
        break;
      case 'goal':
        summary.mode = { kind: 'heading', goal: event.goal };
        summary.plan = null;
        break;
      case 'plan':
        summary.plan = event;
        summary.planProgress = 0;
        if (event.method === 'greedy') summary.greedyPlans += 1;
        break;
      case 'reached':
        summary.mode = { kind: 'reached', goal: event.goal, steps: event.steps };
        summary.plan = null;
        break;
      case 'no-path':
      case 'max-replans':
        summary.mode = {
          kind: 'failed',
          goal: event.goal,
          steps: event.steps,
          reason: event.type === 'no-path' ? 'no path' : 'max replans',
        };
        summary.plan = null;
        break;
      case 'step': {
        if (summary.steps.length === 0) visit(event.from);
        visit(event.to);
        summary.steps.push(event);
        summary.tried.add(`${stateKey(event.from)}|${event.action}`);
        summary.lastStep = event;
        summary.confidence = event.confidence;
        if (event.phase === 'explore') summary.exploreSteps += 1;
        else {
          summary.goalSteps += 1;
          summary.planProgress += 1;
        }
        if (event.surprise) {
          summary.surprises[event.phase] += 1;
          summary.surpriseSteps.push(event);
        }
        for (const write of event.writes) {
          if (write.createdEntry) {
            summary.origins.set(write.key, {
              phase: event.phase,
              surprise: event.surprise,
              step: summary.steps.length,
            });
          }
        }
        break;
      }
    }
  }
  return summary;
}
