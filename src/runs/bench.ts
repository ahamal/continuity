import type { Recipe } from '../agents/recipes';
import type { Scenario } from '../worlds/scenarios';
import { Run } from './run';
import { summarise } from './summary';

/** How one recipe did on one scenario over many seeds. */
export interface BenchRow {
  recipe: string;
  scenario: string;
  seeds: number;
  /** Runs in which every goal was reached. */
  solved: number;
  failed: number;
  meanExploreSteps: number;
  meanGoalSteps: number;
  /** Surprises while heading to a goal, per run. */
  meanSurprises: number;
  meanEntries: number;
  /** Plans that fell back to stepping greedily, over all runs. */
  greedyPlans: number;
}

/**
 * The standard test: explore, then head to each of the scenario's goals in
 * turn. Seeds run from 1 to `seeds`.
 */
export function bench(recipe: Recipe, scenario: Scenario, seeds: number): BenchRow {
  let solved = 0;
  let exploreSteps = 0;
  let goalSteps = 0;
  let surprises = 0;
  let entries = 0;
  let greedyPlans = 0;

  for (let seed = 1; seed <= seeds; seed++) {
    const run = new Run({ recipe, scenario, seed });
    run.do({ type: 'explore' });
    for (const goal of scenario.goals) run.do({ type: 'goal', goal });

    const summary = summarise(run.events);
    const reached = run.events.filter((event) => event.type === 'reached').length;
    if (reached === scenario.goals.length) solved += 1;
    exploreSteps += summary.exploreSteps;
    goalSteps += summary.goalSteps;
    surprises += summary.surprises.goal;
    entries += run.agent.kb.size;
    greedyPlans += summary.greedyPlans;
  }

  const mean = (total: number) => Math.round((total / seeds) * 100) / 100;
  return {
    recipe: recipe.id,
    scenario: scenario.id,
    seeds,
    solved,
    failed: seeds - solved,
    meanExploreSteps: mean(exploreSteps),
    meanGoalSteps: mean(goalSteps),
    meanSurprises: mean(surprises),
    meanEntries: mean(entries),
    greedyPlans,
  };
}
