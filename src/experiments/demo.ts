// Run a scenario from the command line and print what the agent does.
//
//   npm run demo -- 1d
//   npm run demo -- 2d
//   npm run demo -- 2d-walls --seed 7

import { blockedMoves } from '../agents/inspect';
import { twoLevels } from '../agents/recipes';
import { formatState } from '../core/state';
import type { RunEvent } from '../runs/events';
import { Run } from '../runs/run';
import { findScenario, scenarios } from '../worlds/scenarios';
import { isGridWorld, openStates } from '../worlds/world';

function describe(event: RunEvent): string {
  switch (event.type) {
    case 'explore':
      return '=== EXPLORATION PHASE ===\n';
    case 'confident':
      return `\n>>> CONFIDENT after ${event.steps} steps!\n`;
    case 'explore-exhausted':
      return `\nMax steps reached, not fully confident.\n`;
    case 'goal':
      return `Goal: ${formatState(event.goal)}`;
    case 'plan':
      return `Plan from ${formatState(event.from)}: [${event.path.join(', ')}] (${event.status})`;
    case 'step': {
      const move = `${formatState(event.from)} --${event.action}--> ${formatState(event.to)}`;
      if (event.phase === 'explore') {
        return `${move}  (curiosity: ${event.choice!.curiosity.toFixed(2)})`;
      }
      if (!event.surprise) return `  ${move}`;
      return `  ${move}  SURPRISE! (expected ${formatState(event.expected!.state)})\n  Re-planning...`;
    }
    case 'reached':
      return `Reached goal in ${event.steps} steps!\n`;
    case 'no-path':
      return 'No path found!\n';
    case 'max-replans':
      return 'Max replans reached\n';
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const seedFlag = args.indexOf('--seed');
  const seed = seedFlag >= 0 ? Number(args[seedFlag + 1]) : 1;
  const id = args.find((arg, i) => !arg.startsWith('--') && i !== seedFlag + 1) ?? '1d';

  const scenario = findScenario(id);
  if (!scenario) {
    console.error(`Unknown scenario "${id}". Choose one of: ${scenarios.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  const run = new Run({ recipe: twoLevels, scenario, seed });
  let printed = 0;
  const print = () => {
    for (; printed < run.events.length; printed++) console.log(describe(run.events[printed]!));
  };

  console.log(`=== ${scenario.label.toUpperCase()} (seed ${seed}) ===\n`);
  run.do({ type: 'explore' });
  print();

  console.log('=== GOAL-DIRECTED EXECUTION ===\n');
  for (const goal of scenario.goals) {
    run.do({ type: 'goal', goal });
    print();
  }

  if (isGridWorld(run.world)) {
    const blocked = blockedMoves(run.agent, openStates(run.world));
    console.log('=== LEARNED: ACTIONS THAT DO NOTHING ===\n');
    if (blocked.length === 0) console.log('  (none)');
    for (const move of blocked) {
      console.log(`  at ${formatState(move.state)}, ${move.action} does nothing (seen ${move.count}x)`);
    }
  }
  console.log(`\nKnowledge base: ${run.agent.kb.size} entries`);
}

main();
