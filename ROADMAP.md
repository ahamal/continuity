# Roadmap

The goal is one agent that is not a language model and is not trained in advance. It watches
several board games with no knowledge of them, extracts how they work, and plays them. When
there is nothing to watch, it learns by trying things out of curiosity. What it has learned can
be read.

The work is done in parts. The site is five written pages. Two of them have small labs
between their paragraphs, each showing one agent. Page numbers come from the order of the
pages and are written nowhere else, so pages are referred to by name.

## Part 1: the problem

What the agent stores, what that cannot express, and what happens when less and less is
decided in advance. The aim of this part is to understand, not to make anything small or fast.

| Page | Shows |
|---|---|
| Identity Continuity | The conjecture: the mind assigns identity and applies continuity. A continuity is an assumption, curiosity is the lack of one, assumptions run from general to specific, and in order they reach a goal. The goal is an engine that does this in any environment |
| Building the engine | The same ideas as the first page, in the same order, and what each becomes in an engine on a grid: facts, rows, fewer or more facts, a curiosity number, a plan. Ends with the first version, which keeps two levels |
| The first agent | The two-level agent (`two-levels`), and what it cannot hold |
| The second agent | Every combination written down, and every row voting (`every-row`). It does worse, and why |
| The third agent | The same rows, answered by the most specific one (`from-counts`). 500 of 500 in all three worlds |
| The fourth agent | The same rows, read from the general row down (`general-first`). A more specific row answers only if it has held every time. Reaches all 500 random trips on the grid with a wall |
| Findings | What part 1 showed, and where part 2 starts |

Six agents exist in the code and the tests. Two are steps on the way and have no page of
their own: `every-combination`, which stores everything but reads it as the two-level agent
does, and `hierarchy`, which was built by hand to show the shape that is wanted.

Runs solved over seeds 1 to 500 (`npm run bench`). The tests pin these numbers.

| Agent | 1D line | 2D grid | 2D grid with walls |
|---|---|---|---|
| Two levels | 500 | 500 | 367 |
| Every combination | 500 | 500 | 367 |
| Every row has a say | 500 | 131 | 59 |
| Every row holds | 500 | 500 | 500 |
| Read from the counts | 500 | 500 | 500 |
| General first | 500 | 500 | 500 |

The third and fourth agents' exploring hardly uses chance, so on the line and on the grid with
walls their 500 runs are one run repeated. A second test (`src/runs/routes.ts`) compares routes:
after exploring, ten trips to cells picked at random, in each of 50 runs, on the grid with walls.

| Agent | Trips reached, of 500 | Moves against the shortest routes |
|---|---|---|
| Two levels | 482 | 7% more |
| Every row has a say | 265 | 14% more |
| Read from the counts | 494 | 15% more |
| General first | 500 | 8% more |

### Two levels

A port of the original engine. Each move writes two kinds of row: the action alone, and the
action in this exact place. The row with the most facts answers.

- Nothing between "always" and "exactly here" can be held, such as "at x = 9, right does
  nothing". An edge is learned one cell at a time.
- The agent does not know the extent of its world. Its search for a plan gives up after 100
  places, which is why it fails with walls.
- There is one thing in the world, and its identity is given.

### Every combination

One move is a set of facts seen together: the action, the state before, the state after and
the change. Every combination of them is written as a row with a count: 127 rows per move in
the grid. Nothing is set apart as question or answer. It acts exactly as the two-level agent
does (`tests/every-combination.test.ts`), because it reads only the two combinations that
agent used.

### Every row has a say

The same store, read without naming any combination. Every row made of some of the known
facts and one fact about the change has a say. The row that held the largest share of the
times wins.

- It carries an edge over from one bump.
- It also believes rows that have nothing to do with the action. Having only gone up from a
  cell, it expects any action there to go up.
- A row seen once that never failed beats one that held 20 times out of 21.
- A wrong belief that a move does nothing is never tested while heading to a goal, because no
  plan goes through it. Every failed run ended with no plan, not with too many surprises.
- Given enough random moves it sorts itself out and passes the two-level agent, at about 300
  moves in the walls world. The wall itself never carries over: each side must be met.

### Every row holds

Built by hand, as a target. It does not use the combinations or their counts. It keeps one
row per different move and runs a procedure written for the purpose: start from the action
alone, and where that fails, find the fewest facts that pick out the failures and none of the
successes, and put them beneath it as a more specific row that speaks first.

Shown every move of the walls world it arrives at 18 rows, each of which holds: 4 for the
actions, 4 for the edges, 10 for the sides of the wall (`tests/hierarchy.test.ts`). It also
explores for longer, walks to the untried move it is least sure of, plans through specific rows
it has not tested, and may search 2,000 places for a plan. Its 500 of 500 comes from all of
that together.

What it shows is the shape that is wanted: a hierarchy in which every row is true and the
specific row takes precedence. It does not show that this shape comes out of the combinations
and their counts.

### Read from the counts

The same shape with no procedure to build it. The store is every combination, with each
different move counted once. The rows already form a hierarchy from general to specific: a
row with more facts is a more specific case of every row made of some of them. To answer,
the agent falls down it.

1. The most specific row that applies speaks.
2. Between rows equally specific, the one with the better standing. Standing is
   held / (seen + 1), as if the row were to fail the next time it is tested.

An earlier version also had a rule that a row is passed over when a holding row containing
it says something different. It was not needed: plain fall-through to the most specific row
gives the same results.

Shown every move of the walls world it predicts all 384 (`tests/from-counts.test.ts`).
Nothing puts the action first, and the four action rows come out on top: each speaks for 82
to 85 moves itself and needs 2 to 5 specific rows under it, which together are the 18 rows written by
hand. A row about a place, such as `x = 0`, can be made to hold too, but speaks for 12 moves
and needs 19 specific rows under it. The action is at the top because the hierarchy is smallest there.

It explores as the hand-built agent does (walks to the untried move it is least sure of, 100
steps) and plans through rows seen fewer than five times, with 2,000 places to search.

Still chosen in the code: that the question is what will change, the "+ 1", and those
exploring and planning numbers.

What it gets wrong: it follows the most specific row whatever its record. After three bumps
into the wall, "right at x = 4 changes nothing" answers for the whole column, and it goes on
answering after the agent has got past at x = 4 elsewhere and the row has held 3 times out of
5. So the agent keeps going round the wall the one way it knows, 14 moves where 10 would do.
The tests used when the earlier rule was dropped only asked whether a goal was reached, so
they did not show this.

### General first

The same store, read from the general row down.

1. For a move it has made, that move's own row answers.
2. Otherwise it starts from the general row: of the rows with one fact, the one that has been
   right about the most moves.
3. A more specific row beneath it answers instead only if it has held every time it was seen.
   Between rows equally specific, the one with the better standing.

A row that has failed is not followed. The rows beneath it that do hold are followed where
they apply, and the general row everywhere else. So the edge stays one row, and a guess about
a wall is dropped the first time it fails (`tests/general-first.test.ts`).

On the trips test it reaches all 500 trips on the grid with walls, with routes 8% longer than
the shortest, against 494 trips and 15% for the agent above. Some of what is left is bumps:
each cell beside the wall still costs one. How much of the 8% that is has not been measured.

Still chosen in the code: everything above, and that a row must hold every time, which would
not suit a world with chance in it.

## Part 2: working backwards

Not started. For each world, write by hand the continuities that describe it, in whatever
facts make them fewest. Then ask what the agent would need in order to arrive at them.

How small the hierarchy can be depends on what the facts are. For the walls world: 388 rows
with one row per move, 18 as a hierarchy over x and y, 8 if the facts are what is to the left,
right, above and below, and about 5 with things at places and "two things cannot be in the
same place".

## Later

Provisional, and to be reordered once part 2 is done.

- Several things in one world, unlabelled, grouped into kinds
- Learning by watching moves it did not make
- Tic-tac-toe and Connect Four
- Checkers
- Chess movement, then check and the special moves
- Playing, by search over what was learned
- Transfer across games, measured
