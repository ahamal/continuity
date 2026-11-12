# Roadmap

The goal is one agent that is not a language model and is not trained in advance. It watches
several board games with no knowledge of them, extracts how they work, and plays them. When
there is nothing to watch, it learns by trying things out of curiosity. What it has learned can
be read.

Each stage gets a page on the site with the thinking behind it, a recipe in the code, and
numbers from the benchmark.

| # | Stage | State |
|---|---|---|
| 1 | Background theory | Written |
| 2 | Implementation | Written |
| 3 | 1D world | Runs |
| 4 | 2D world, with and without walls | Runs |
| 5 | Better representation of states | In progress |
| 6 | Several things in one world, unlabelled, grouped into kinds | Planned |
| 7 | Learning by watching moves it did not make | Planned |
| 8 | Tic-tac-toe and Connect Four | Planned |
| 9 | Checkers | Planned |
| 10 | Chess movement, then check and the special moves | Planned |
| 11 | Playing, by search over the learned rules | Planned |
| 12 | Transfer across games, measured | Planned |

Stages after 6 are provisional.

## Where stage 4 stands

Measured over seeds 1 to 500 (`npm run bench`):

| Scenario | Solved |
|---|---|
| 1D line | 500 of 500 |
| 2D grid | 500 of 500 |
| 2D grid with walls | 367 of 500 |

Known limits, which stage 5 starts from:

- Only two levels of generality are stored: the action alone, and the action in one exact
  state. Nothing in between, such as "at x = 9, right does nothing".
- The agent does not know the extent of its world. Its search spends its budget on cells
  outside the grid, which is why it fails with walls. In the open 2D grid every plan already
  falls back to stepping greedily.
- There is one thing in the world, and its identity is given.
- An entry keeps every outcome it has seen, but predictions use only the most frequent one.

## Stage 5 is done when

- Levels between "always" and "exactly here" come to exist without storing every combination.
- The agent learns an edge or a wall as one rule, not one cell at a time.
- The same representation serves the line and the grid.
- The walls scenario is solved more often than 367 of 500, with the stage 4 numbers unchanged.
