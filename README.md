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

The site records the work stage by stage, with the thinking behind each one.

| # | Stage | State |
|---|---|---|
| 1 | Background theory | Written |
| 2 | Implementation | Written |
| 3 | 1D world | Runs |
| 4 | 2D world, with and without walls | Runs |
| 5 | Better representation of states | In progress |

Stages 3 and 4 are a port of the original Python engine, with the same behaviour.

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
| `npm run build` | Builds the site into `dist/` |

## Layout

```
src/
  engine/       facts and the knowledge base
  agent/        observe, predict, curiosity, plan, surprise
  worlds/       the line, the grid, and ready-made scenarios
  experiments/  command-line runs
  web/
    pages/      one page per stage
    lab/        the interactive view used by stages 3 and 4
tests/
```

The engine and agent have no dependency on the browser, so the same code runs on the site and
from the command line.
