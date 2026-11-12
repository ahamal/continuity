// Run a scenario from the command line and print what the agent does.
//
//   npm run demo -- 1d
//   npm run demo -- 2d
//   npm run demo -- 2d-walls --seed 7

import { Agent } from '../agent/agent';
import type { AgentEvent } from '../agent/events';
import { blockedMoves } from '../agent/inspect';
import { seededRandom } from '../agent/random';
import { findScenario, scenarios } from '../worlds/scenarios';
import { formatState } from '../worlds/world';

function describe(event: AgentEvent): string {
  switch (event.type) {
    case 'explore-step':
      return `step ${event.index}: ${formatState(event.from)} --${event.action}--> ${formatState(event.to)}  (curiosity: ${event.curiosity.toFixed(2)})`;
    case 'confident':
      return `\n>>> CONFIDENT after ${event.steps} steps!\n`;
    case 'explore-exhausted':
      return `\nMax steps reached, not fully confident.\n`;
    case 'goal':
      return `Goal: ${formatState(event.goal)}`;
    case 'plan':
      return `Plan from ${formatState(event.from)}: [${event.path.join(', ')}] (${event.status})`;
    case 'step': {
      const move = `  ${formatState(event.from)} --${event.action}--> ${formatState(event.to)}`;
      if (!event.surprise) return move;
      return `${move}  SURPRISE! (expected ${formatState(event.expected!)})\n  Re-planning...`;
    }
    case 'reached':
      return `Reached goal in ${event.steps} steps!`;
    case 'no-path':
      return 'No path found!';
    case 'max-replans':
      return 'Max replans reached';
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

  const world = scenario.create();
  const agent = new Agent(world, { random: seededRandom(seed) });

  console.log(`=== ${scenario.label.toUpperCase()} (seed ${seed}) ===\n`);
  console.log('=== EXPLORATION PHASE ===\n');
  for (const event of agent.explore(scenario.exploreSteps)) console.log(describe(event));

  console.log('=== GOAL-DIRECTED EXECUTION ===\n');
  for (const goal of scenario.goals) {
    for (const event of agent.executePlan(goal)) console.log(describe(event));
    console.log();
  }

  const blocked = blockedMoves(agent, world);
  console.log('=== LEARNED: ACTIONS THAT DO NOTHING ===\n');
  if (blocked.length === 0) console.log('  (none)');
  for (const move of blocked) {
    console.log(`  at ${formatState(move.state)}, ${move.action} does nothing (seen ${move.count}x)`);
  }
  console.log(`\nKnowledge base: ${agent.kb.size} entries`);
}

main();
