import type { Agent } from '../agents/agent';
import type { Recipe } from '../agents/recipes';
import { seededRandom } from '../core/random';
import type { State } from '../core/state';
import type { Scenario } from '../worlds/scenarios';
import type { World } from '../worlds/world';
import { explore, pursue } from './drivers';
import { type RunEvent, endsCommand } from './events';

export interface RunConfig {
  recipe: Recipe;
  scenario: Scenario;
  seed: number;
}

/** Something a run is told to do. */
export type Command = { type: 'explore' } | { type: 'goal'; goal: State };

/** A command, and how many events the run had reported when it was given. */
export interface ScriptItem {
  command: Command;
  at: number;
}

/**
 * One agent in one world, from nothing. A run is fully determined by its
 * recipe, scenario, seed and the commands it was given, so it can be repeated
 * exactly and rebuilt up to any point (see `replay`).
 */
export class Run {
  readonly world: World;
  readonly agent: Agent;
  readonly events: RunEvent[] = [];
  readonly script: ScriptItem[] = [];
  private current: Generator<RunEvent> | null = null;

  constructor(readonly config: RunConfig) {
    this.world = config.scenario.create();
    this.agent = config.recipe.build(this.world, seededRandom(config.seed));
  }

  /** True while a command still has events to report. */
  get busy(): boolean {
    return this.current !== null;
  }

  /** Start a command. A command that was still under way is dropped. */
  start(command: Command): void {
    this.script.push({ command, at: this.events.length });
    this.current =
      command.type === 'explore'
        ? explore(this.agent, this.world, this.config.scenario.exploreSteps)
        : pursue(this.agent, this.world, command.goal);
  }

  /** Take the next event of the current command, or null if there is none. */
  advance(): RunEvent | null {
    if (!this.current) return null;
    const next = this.current.next();
    if (next.done) {
      this.current = null;
      return null;
    }
    this.events.push(next.value);
    if (endsCommand(next.value)) this.current = null;
    return next.value;
  }

  /** Run the current command to its end. */
  finish(): void {
    while (this.advance()) {
      // Keep going.
    }
  }

  /** Start a command and run it to its end. */
  do(command: Command): void {
    this.start(command);
    this.finish();
  }
}

/**
 * Carry `run` forward until it has reported `upTo` events, giving each command
 * of `script` at the point it was first given. A command cut off by `upTo` is
 * left under way.
 */
export function advanceTo(run: Run, script: readonly ScriptItem[], upTo: number): Run {
  let next = run.script.length;

  while (run.events.length < upTo) {
    const item = script[next];
    if (item && item.at <= run.events.length) {
      run.start(item.command);
      next += 1;
      continue;
    }
    // Stop when there is nothing left to do, or when the script expects more
    // events before its next command than this run produced.
    if (!run.advance()) break;
  }
  return run;
}

/** Rebuild a run from nothing up to its first `upTo` events. */
export function replay(config: RunConfig, script: readonly ScriptItem[], upTo: number): Run {
  return advanceTo(new Run(config), script, upTo);
}
