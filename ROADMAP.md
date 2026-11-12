# Roadmap

The goal is one agent that is not a language model and is not trained in advance. It watches
several board games with no knowledge of them, extracts how they work, and plays them. When
there is nothing to watch, it learns by trying things out of curiosity. What it has learned can
be read.

Each stage gets a page on the site with the thinking behind it, a recipe in the code, and
numbers from the benchmark.

The work is done in parts.

## Part 1: the problem

What the agent stores, what that cannot express, and what the store looks like when nothing
is chosen in advance. The aim of this part is to understand, not to make anything small or
fast.

| # | Stage | State |
|---|---|---|
| 1 | Background theory | Written |
| 2 | Implementation | Written |
| 3 | 1D world | Runs |
| 4 | 2D world | Runs |
| 5 | 2D world with walls | Runs |
| 6 | What stages 3 to 5 leave open | Written |
| 7 | Every combination: each move writes every combination of its facts | Runs |
| 8 | Every row has a say: the same store, read without naming any combination | Runs |

Stage 7 uses the recipe `every-combination`. It acts exactly as stages 3 to 5 do
(`tests/every-combination.test.ts` checks this). Only what it stores differs: with n facts in
a move it writes 2^n - 1 rows, each a set of facts and how often they were seen together.

Stage 8 uses the recipe `every-row`. To predict, every row made of some of the known facts
and one fact about the change has a say. The row that held the largest share of the times
wins. A tie goes to more facts, then to more sightings.

| Scenario | Stages 3 to 5, and 7 | Stage 8 |
|---|---|---|
| 1D line | 500 of 500 | 500 of 500 |
| 2D grid | 500 of 500 | 131 of 500 |
| 2D grid with walls | 367 of 500 | 59 of 500 |

What stage 8 shows:

- It carries an edge over from one bump: "action = right, x = 9" has always gone with no
  change, so it expects the edge along the whole column.
- It also believes rows that have nothing to do with the action. Having only gone up from a
  cell, it expects any action there to go up. After exploring, about one in five of its
  predictions over the whole world is wrong, against one in ten for stages 3 to 5.
- A wrong belief that a move does nothing is never tested while heading to a goal, because
  no plan goes through it. Every failed run ended with no plan, not with too many surprises.

## Part 2: working backwards

Not started. For each world, write by hand the continuities that describe it, and give them
to the agent. Then ask what it would take to arrive at them from what part 1 stores.

For the walls world with the facts action, x and y, 18 hand-written continuities predict
every move: 4 for the actions, 4 for the edges, 10 for the sides of the wall.

## Later

Provisional, and to be reordered once part 2 is done.

- Several things in one world, unlabelled, grouped into kinds
- Learning by watching moves it did not make
- Tic-tac-toe and Connect Four
- Checkers
- Chess movement, then check and the special moves
- Playing, by search over what was learned
- Transfer across games, measured

## Where stages 3 to 5 stand

Measured over seeds 1 to 500 (`npm run bench`):

| Scenario | Solved |
|---|---|
| 1D line | 500 of 500 |
| 2D grid | 500 of 500 |
| 2D grid with walls | 367 of 500 |

Known limits, set out in stage 6:

- Only two levels of generality are stored: the action alone, and the action in one exact
  state. Nothing in between, such as "at x = 9, right does nothing".
- The agent does not know the extent of its world. Its search spends its budget on cells
  outside the grid, which is why it fails with walls. In the open 2D grid every plan already
  falls back to stepping greedily.
- There is one thing in the world, and its identity is given.
- An entry keeps every outcome it has seen, but predictions use only the most frequent one.

## What a better representation has to do

- Levels between "always" and "exactly here" come to exist without storing every combination.
- The agent learns an edge or a wall as one continuity, not one cell at a time.
- The same representation serves the line and the grid.
- The walls scenario is solved more often than 367 of 500, with the numbers of stages 3 to 5 unchanged.
