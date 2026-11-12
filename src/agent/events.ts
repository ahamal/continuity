import type { Action, State } from '../worlds/world';

export type PlanStatus =
  | 'success'
  | 'stuck in loop'
  | 'no improving action'
  | 'max steps reached';

export interface Plan {
  path: Action[];
  status: PlanStatus;
}

/** What the agent reports while it explores out of curiosity. */
export type ExploreEvent =
  | {
      type: 'explore-step';
      index: number;
      from: State;
      action: Action;
      to: State;
      /** How curious the agent was about this action before taking it. */
      curiosity: number;
    }
  | { type: 'confident'; steps: number }
  | { type: 'explore-exhausted'; steps: number };

/** What the agent reports while it works toward a goal. */
export type ExecuteEvent =
  | { type: 'goal'; goal: State }
  | { type: 'plan'; from: State; path: Action[]; status: PlanStatus }
  | {
      type: 'step';
      from: State;
      action: Action;
      to: State;
      /** What the agent predicted, or null if it had no prediction. */
      expected: State | null;
      /** True when the result differed from the prediction. */
      surprise: boolean;
    }
  | { type: 'reached'; steps: number }
  | { type: 'no-path' }
  | { type: 'max-replans' };

export type AgentEvent = ExploreEvent | ExecuteEvent;

export type ExecuteStatus = 'success' | 'no path' | 'max replans';

export interface ExecuteResult {
  steps: number;
  status: ExecuteStatus;
}
