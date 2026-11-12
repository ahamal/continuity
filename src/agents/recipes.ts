import type { Random } from '../core/random';
import type { WorldShape } from '../core/state';
import { Agent } from './agent';
import {
  curiosityFromCombinations,
  everyCombinationStorage,
  exactThenUsualChange,
} from './every-combination/every-combination';
import { curiosityFromBacking, everyRowPredictor, everyRowStorage } from './every-row/every-row';
import { searchThenGreedy } from './planning/search-then-greedy';
import { coordinates } from './representations/coordinates';
import { countCuriosity, specificThenGeneral, twoLevelStorage } from './two-levels/two-levels';

/**
 * A named way of putting an agent together. Each stage of the project that
 * runs has one, and it keeps working after later stages are added, so an old
 * stage's page and numbers never change under it.
 */
export interface Recipe {
  id: string;
  label: string;
  /** What is distinctive about this agent, in a sentence. */
  summary: string;
  build(shape: WorldShape, random?: Random): Agent;
}

/** Stages 3 and 4: the port of the original engine. */
export const twoLevels: Recipe = {
  id: 'two-levels',
  label: 'Two levels',
  summary:
    'Stores each observation at two levels: the action alone, and the action in this exact state.',
  build: (shape, random) =>
    new Agent(
      shape.actions,
      {
        representation: coordinates(shape.stateParts),
        storage: twoLevelStorage,
        predictor: specificThenGeneral,
        explorer: countCuriosity(5),
        planner: searchThenGreedy({ maxVisited: 100 }),
      },
      random,
    ),
};

/**
 * The last stage of part 1. It acts exactly as `twoLevels` does. What differs
 * is what it writes down: every combination of the facts of each move.
 */
export const everyCombination: Recipe = {
  id: 'every-combination',
  label: 'Every combination',
  summary:
    'Stores every combination of the facts of each move, with how often they were seen together.',
  build: (shape, random) =>
    new Agent(
      shape.actions,
      {
        representation: coordinates(shape.stateParts),
        storage: everyCombinationStorage,
        predictor: exactThenUsualChange,
        explorer: curiosityFromCombinations(5),
        planner: searchThenGreedy({ maxVisited: 100 }),
      },
      random,
    ),
};

/**
 * Stage 8. The store of stage 7, read without naming any combination: every
 * row that could answer has a say, and one rule decides between them.
 */
export const everyRow: Recipe = {
  id: 'every-row',
  label: 'Every row has a say',
  summary:
    'Stores every combination, and answers from whichever row has held the largest share of the times.',
  build: (shape, random) =>
    new Agent(
      shape.actions,
      {
        representation: coordinates(shape.stateParts),
        storage: everyRowStorage,
        predictor: everyRowPredictor,
        explorer: curiosityFromBacking(5),
        planner: searchThenGreedy({ maxVisited: 100 }),
      },
      random,
    ),
};

export const recipes: Recipe[] = [twoLevels, everyCombination, everyRow];

export function findRecipe(id: string): Recipe | undefined {
  return recipes.find((recipe) => recipe.id === id);
}
