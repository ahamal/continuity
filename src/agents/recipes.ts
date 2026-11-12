import type { Random } from '../core/random';
import type { WorldShape } from '../core/state';
import { Agent } from './agent';
import {
  curiosityFromCombinations,
  everyCombinationStorage,
  exactThenUsualChange,
} from './every-combination/every-combination';
import { curiosityFromBacking, everyRowPredictor, everyRowStorage } from './every-row/every-row';
import { countOnceStorage, fromCountsPredictor, seekLeastSure, throughThinRows } from './from-counts/from-counts';
import {
  generalFirstPredictor,
  seekLeastSureGeneralFirst,
  throughThinRowsGeneralFirst,
} from './general-first/general-first';
import { hierarchyPredictor, movesStorage, seekUntried, throughGuesses } from './hierarchy/hierarchy';
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

/** The first agent: the port of the original engine. */
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
 * It acts exactly as `twoLevels` does. What differs
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
 * The store of `everyCombination`, read without naming any combination: every
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

/**
 * Built by hand, as a target. A hierarchy in which every row holds: a row says what an action
 * does, and where it fails a more specific row beneath it speaks first.
 */
export const hierarchy: Recipe = {
  id: 'hierarchy',
  label: 'Every row holds',
  summary:
    'Builds a hierarchy of rows for each action. An exception speaks before the row above it, so every row holds.',
  build: (shape, random) =>
    new Agent(
      shape.actions,
      {
        representation: coordinates(shape.stateParts),
        storage: movesStorage,
        predictor: hierarchyPredictor,
        explorer: seekUntried(),
        // Knowing where the wall is, the way round it is longer than the 100 places
        // the earlier stages search. The search is the same, with more room.
        planner: throughGuesses(searchThenGreedy({ maxVisited: 2000 }), 5),
      },
      random,
    ),
};

/**
 * A hierarchy read from the counts of every combination, with no procedure
 * that builds one: an exception speaks first, otherwise the row with the best
 * standing does.
 */
export const fromCounts: Recipe = {
  id: 'from-counts',
  label: 'Read from the counts',
  summary:
    'Stores every combination, counting each different move once. An exception speaks first, otherwise the best standing.',
  build: (shape, random) =>
    new Agent(
      shape.actions,
      {
        representation: coordinates(shape.stateParts),
        storage: countOnceStorage,
        predictor: fromCountsPredictor,
        explorer: seekLeastSure(),
        planner: throughThinRows(searchThenGreedy({ maxVisited: 2000 }), 5),
      },
      random,
    ),
};

/**
 * The store of `fromCounts`, read from the general row down. A more specific
 * row answers only if it has held every time, so a row that has failed is not
 * followed.
 */
export const generalFirst: Recipe = {
  id: 'general-first',
  label: 'General first',
  summary:
    'Stores every combination. Starts from the general row, and a more specific row answers only if it has held every time.',
  build: (shape, random) =>
    new Agent(
      shape.actions,
      {
        representation: coordinates(shape.stateParts),
        storage: countOnceStorage,
        predictor: generalFirstPredictor,
        explorer: seekLeastSureGeneralFirst(),
        planner: throughThinRowsGeneralFirst(searchThenGreedy({ maxVisited: 2000 }), 5),
      },
      random,
    ),
};

export const recipes: Recipe[] = [twoLevels, everyCombination, everyRow, hierarchy, fromCounts, generalFirst];

export function findRecipe(id: string): Recipe | undefined {
  return recipes.find((recipe) => recipe.id === id);
}
