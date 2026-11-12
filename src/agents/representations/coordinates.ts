import type { Facts } from '../../core/facts';
import type { State, StatePart } from '../../core/state';
import type { Representation } from '../parts';

/**
 * A state is its raw coordinates, one fact per coordinate. A
 * change is the difference in each coordinate, and distance is the sum of
 * those differences.
 */
export function coordinates(parts: readonly StatePart[]): Representation {
  return {
    changeNames: parts.map((part) => part.change),

    describe(state: State): Facts {
      const facts: Record<string, number> = {};
      parts.forEach((part, i) => (facts[part.name] = state[i]!));
      return facts;
    },

    change(before: State, after: State): Facts {
      const facts: Record<string, number> = {};
      parts.forEach((part, i) => (facts[part.change] = after[i]! - before[i]!));
      return facts;
    },

    apply(state: State, change: Facts): State {
      return parts.map((part, i) => {
        const amount = change[part.change];
        return state[i]! + (typeof amount === 'number' ? amount : 0);
      });
    },

    distance(a: State, b: State): number {
      return a.reduce((sum, value, i) => sum + Math.abs(value - b[i]!), 0);
    },
  };
}
