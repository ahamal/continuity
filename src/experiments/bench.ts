// Score every recipe on every scenario and save the table.
//
//   npm run bench
//   npm run bench -- --seeds 100

import { mkdirSync, writeFileSync } from 'node:fs';
import { recipes } from '../agents/recipes';
import { type BenchRow, bench } from '../runs/bench';
import { scenarios } from '../worlds/scenarios';

const args = process.argv.slice(2);
const seedsFlag = args.indexOf('--seeds');
const seeds = seedsFlag >= 0 ? Number(args[seedsFlag + 1]) : 500;

const rows: BenchRow[] = [];
for (const recipe of recipes) {
  for (const scenario of scenarios) rows.push(bench(recipe, scenario, seeds));
}

console.table(
  rows.map((row) => ({
    recipe: row.recipe,
    scenario: row.scenario,
    solved: `${row.solved}/${row.seeds}`,
    'explore steps': row.meanExploreSteps,
    'goal steps': row.meanGoalSteps,
    surprises: row.meanSurprises,
    entries: row.meanEntries,
    'greedy plans': row.greedyPlans,
  })),
);

mkdirSync('results', { recursive: true });
for (const recipe of recipes) {
  const file = `results/${recipe.id}.json`;
  const own = rows.filter((row) => row.recipe === recipe.id);
  writeFileSync(file, `${JSON.stringify(own, null, 2)}\n`);
  console.log(`Saved ${file}`);
}
