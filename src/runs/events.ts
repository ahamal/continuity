import type { ActionConfidence, ExploreChoice, Plan, Prediction } from '../agents/parts';
import type { Write } from '../core/knowledge-base';
import type { Action, State } from '../core/state';

/** What was driving the agent when it made a move. */
export type Phase = 'explore' | 'goal';

/** One move, with everything needed to explain it afterwards. */
export interface StepEvent {
  type: 'step';
  phase: Phase;
  from: State;
  action: Action;
  to: State;
  /** What the agent predicted before the move, or null if it had no prediction. */
  expected: Prediction | null;
  /** True when the result differed from the prediction. */
  surprise: boolean;
  /** What the observation wrote to the knowledge base. */
  writes: Write[];
  /** How close each action is to being trusted, after this move. */
  confidence: ActionConfidence[];
  /** While exploring: how the action was chosen. */
  choice?: ExploreChoice;
  /** While heading to a goal: where this move sits in the plan (1-based). */
  planStep?: { index: number; of: number };
  goal?: State;
}

/** Everything a run reports, in order. Views turn these into words and pictures. */
export type RunEvent =
  | StepEvent
  | { type: 'explore'; maxSteps: number }
  | { type: 'confident'; steps: number }
  | { type: 'explore-exhausted'; steps: number }
  | { type: 'goal'; goal: State }
  | ({
      type: 'plan';
      from: State;
      goal: State;
      /** The states the agent expects to pass through, one per action. */
      states: State[];
      /** 1 for the first plan toward this goal, 2 after the first surprise, and so on. */
      attempt: number;
    } & Plan)
  | { type: 'reached'; goal: State; steps: number }
  | { type: 'no-path'; goal: State; steps: number }
  | { type: 'max-replans'; goal: State; steps: number };

export type Outcome = 'success' | 'no path' | 'max replans';

/** Events that end the command they belong to. */
export function endsCommand(event: RunEvent): boolean {
  return (
    event.type === 'confident' ||
    event.type === 'explore-exhausted' ||
    event.type === 'reached' ||
    event.type === 'no-path' ||
    event.type === 'max-replans'
  );
}
