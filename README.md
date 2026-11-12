# Continuity

One agent that learns how a world works and then acts in it.

- It is not a language model.
- It is not trained in advance.
- It starts with no knowledge of the world it is placed in.
- It learns by watching, or, when there is nothing to watch, by trying things out of curiosity.
- What it has learned can be read.

The target is a single agent that can watch several board games, extract their rules and play
them, and that handles the 1D and 2D grid worlds the same way.

## Stages

The site records the work stage by stage, with the thinking behind each one. Part 1, the
problem, is stages 1 to 8. Part 2, working backwards from continuities written by hand, has
not started. See [ROADMAP.md](ROADMAP.md) for all the stages and
[ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organised.

Stages 3 to 5 are a port of the original Python engine, with the same behaviour.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the tests |
| `npm run typecheck` | Checks types |
| `npm run demo -- 2d-walls --seed 3` | Runs a scenario in the terminal (`1d`, `2d`, `2d-walls`) |
| `npm run bench` | Scores every recipe on every scenario over 500 seeds and saves the table in `results/` |
| `npm run build` | Builds the site into `dist/` |

## Layout

```
src/
  core/         facts, the knowledge base, states
  worlds/       the line, the grid, and ready-made scenarios
  agents/       the agent, its parts, and one recipe per stage
  runs/         connects an agent to a world; events, replay, benchmark
  experiments/  command-line programs
  web/
    pages/      one page per stage
    lab/        the interactive view used by stages 3 to 5
tests/
results/        saved benchmark tables
```

Nothing below `web/` depends on the browser, so the same code runs on the site, in the tests
and from the command line.
