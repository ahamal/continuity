import type { Facts } from '../../core/facts';
import type { QueryResult } from '../../core/knowledge-base';
import { pick } from '../../core/random';
import type { Action, State } from '../../core/state';
import type { Explorer, Mind, Predictor, Storage } from '../parts';

// The two-level agent. Every observation is stored at two levels of generality:
// what the action does in general, and what it did in this exact state.
// Prediction and curiosity read those same two levels, so the three parts
// live together here.

/** The inputs of a specific entry: the whole state and the action. */
function exactCase(mind: Mind, state: State, action: Action): Facts {
  return { ...mind.representation.describe(state), action };
}

/** The general rule for an action: its most often seen change. */
function generalRule(mind: Mind, action: Action): QueryResult | null {
  return mind.kb.query(mind.representation.changeNames[0]!, { action });
}

export const twoLevelStorage: Storage = {
  store(mind, before, action, after) {
    const change = mind.representation.change(before, after);
    const here = exactCase(mind, before, action);
    return [
      // General: what this action does, wherever it is taken.
      mind.kb.observe({ action }, change),
      // Specific: what this action did in this exact state.
      mind.kb.observe(here, { new_state: after }),
      mind.kb.observe(here, change),
    ];
  },
};

/** Use the exact case if it was seen. Otherwise apply the action's general change. */
export const specificThenGeneral: Predictor = {
  predict(mind, state, action) {
    const specific = mind.kb.query('new_state', exactCase(mind, state, action));
    if (specific) {
      return {
        state: specific.value as State,
        source: 'specific',
        specificity: specific.specificity,
        count: specific.count,
        basis: [specific.entry.key],
      };
    }

    const change: Record<string, number> = {};
    const basis = new Set<string>();
    let count = 0;
    for (const name of mind.representation.changeNames) {
      const general = mind.kb.query(name, { action });
      if (general) {
        change[name] = general.value as number;
        count = Math.max(count, general.count);
        basis.add(general.entry.key);
      }
    }
    if (basis.size === 0) return null;

    return {
      state: mind.representation.apply(state, change),
      source: 'general',
      specificity: 1,
      count,
      basis: [...basis],
    };
  },
};

/**
 * Curiosity from counts. Zero once this exact case has been seen, or once the
 * action's general rule has been seen `threshold` times. Otherwise one divided
 * by the number of times the general rule has been seen.
 */
export function countCuriosity(threshold = 5): Explorer {
  const explorer: Explorer = {
    curiosity(mind, state, action) {
      if (mind.kb.query('new_state', exactCase(mind, state, action))) return 0;

      const general = generalRule(mind, action);
      if (!general) return 1;
      if (general.count >= threshold) return 0;
      return 1 / general.count;
    },

    confidence(mind) {
      return mind.actions.map((action) => ({
        action,
        seen: generalRule(mind, action)?.count ?? 0,
        needed: threshold,
      }));
    },

    choose(mind, state) {
      const scores = mind.actions.map((action) => ({
        action,
        curiosity: explorer.curiosity(mind, state, action),
      }));

      let best = scores[0]!;
      for (const score of scores) {
        if (score.curiosity > best.curiosity) best = score;
      }

      if (best.curiosity === 0) {
        // Nothing here is interesting. Move at random to find something that is.
        return { action: pick(mind.actions, mind.random), curiosity: 0, scores, random: true };
      }
      return { action: best.action, curiosity: best.curiosity, scores, random: false };
    },
  };
  return explorer;
}
