import type { Recipe } from '../../agents/recipes';
import { type Command, Run, type RunConfig, advanceTo, replay } from '../../runs/run';
import type { Scenario } from '../../worlds/scenarios';

/**
 * Holds one run and a position in it.
 *
 * Commands are carried out in full straight away. What plays on screen is the
 * position moving through the recorded events. Because a run can be rebuilt
 * exactly, the position can move backward as freely as forward, and `view` is
 * always the agent as it was at that position.
 */
export class Controller {
  /** The whole run so far. */
  head!: Run;
  /** The run as it was at `cursor`. */
  view!: Run;
  /** How many of the head's events are being shown. */
  cursor = 0;
  playing = false;
  /** Stops per second while playing. */
  speed = 6;
  private timer: number | undefined;

  constructor(
    private readonly recipe: Recipe,
    public scenario: Scenario,
    public seed: number,
    private readonly onChange: () => void,
  ) {
    this.reset();
  }

  get config(): RunConfig {
    return { recipe: this.recipe, scenario: this.scenario, seed: this.seed };
  }

  get atEnd(): boolean {
    return this.cursor >= this.head.events.length;
  }

  /**
   * The positions worth stopping at: the start, the moment each command was
   * given, the moment before each move, and the end.
   */
  stops(): number[] {
    const stops = new Set<number>([0, this.head.events.length]);
    for (const item of this.head.script) stops.add(item.at);
    this.head.events.forEach((event, i) => {
      if (event.type === 'step') stops.add(i);
    });
    return [...stops].sort((a, b) => a - b);
  }

  reset(scenario = this.scenario, seed = this.seed): void {
    this.pause(false);
    this.scenario = scenario;
    this.seed = seed;
    this.head = new Run(this.config);
    this.view = this.head;
    this.cursor = 0;
    this.onChange();
  }

  /** Give the agent something to do from the position being shown, and play it. */
  command(command: Command): void {
    const base = this.atEnd ? this.head : replay(this.config, this.head.script, this.cursor);
    base.do(command);
    this.head = base;
    this.view = replay(this.config, this.head.script, this.cursor);
    this.play();
  }

  seek(position: number): void {
    const target = Math.max(0, Math.min(position, this.head.events.length));
    if (target === this.head.events.length) {
      this.view = this.head;
    } else if (this.view !== this.head && target >= this.view.events.length) {
      advanceTo(this.view, this.head.script, target);
    } else {
      this.view = replay(this.config, this.head.script, target);
    }
    this.cursor = target;
    this.onChange();
  }

  forward(): boolean {
    const next = this.stops().find((stop) => stop > this.cursor);
    if (next === undefined) return false;
    this.seek(next);
    return true;
  }

  back(): boolean {
    const previous = this.stops().filter((stop) => stop < this.cursor).at(-1);
    if (previous === undefined) return false;
    this.seek(previous);
    return true;
  }

  play(): void {
    if (this.atEnd) {
      this.onChange();
      return;
    }
    this.playing = true;
    this.schedule();
    this.onChange();
  }

  pause(notify = true): void {
    this.playing = false;
    window.clearTimeout(this.timer);
    if (notify) this.onChange();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.playing) this.schedule();
  }

  dispose(): void {
    window.clearTimeout(this.timer);
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.playing) return;
      this.forward();
      if (this.atEnd) this.pause();
      else this.schedule();
    }, 1000 / this.speed);
  }
}
