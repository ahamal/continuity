# Handover for Part 2

Written at the end of Part 1 for whoever picks the work up next. Read this, then `CLAUDE.md`,
`ROADMAP.md` and `ARCHITECTURE.md`, then the seven pages in `src/web/pages/` in order. The
pages are the record of the thinking, and the first one is the theory in the user's own words.

## What the project is

A conjecture about how the human mind makes sense of the world: it identifies something, then
applies continuity to it. The project tries to turn that into a general engine that learns
about the world it is in and can use what it has learned. It is not a language model and it is
not trained in advance.

The theory is the user's. Use their terms:

- **Identity**: something picked out and labelled as a thing.
- **Continuity**: recognising it as the same thing after something has happened to it, and
  what happened. A continuity is an **assumption**.
- **Hierarchy of assumptions**: from general to specific. A more specific one is followed
  where it applies.
- **Curiosity**: a missing assumption.
- **Reasoning**: assumptions applied one after another to reach a goal.

Do not say "rule", "exception" or "override". Surprise is not a separate idea: a wrong
prediction is written like any other move. "Engine" is the design; "the first agent", "the
second agent" and so on are builds of it.

## How the user works

- **Discuss first. Build only when told to.** Say what you would do and wait for "go" or
  "do it". Small wording fixes they ask for directly are fine.
- **Plain language.** Short plain sentences in the "we" voice of the first page. Plain section
  names (Identity, Results, Next). No clever phrasing and no "it is not X, it is Y" turns.
- **Write with conviction, and stay exact.** State results as results. Say plainly what is
  measured, what is an estimate, and what is handed to the agent.
- **When they give a draft, refine it.** Keep their meaning and register. Do not paste it back
  word for word, and do not replace it with your own framing.
- **Take what they notice in the playables seriously.** The fourth agent exists because they
  saw the third one always going over the wall. Reproduce the observation with a measurement
  before theorising about it.
- **The viewer is a thinking tool.** Each agent page has the same flow: How it works (with a
  figure of what changed from the agent before), Try it, Results, What is missing, Next. The
  lab panel is called "Knowledge base".
- They do not care about dark mode for now.

## Where Part 1 ended

Four agents, each on its own page. Recipes are in `src/agents/recipes.ts`.

| Page | Recipe | Writes | Answers |
|---|---|---|---|
| The first agent | `two-levels` | The move alone, and the move at one exact place | The exact place, else the move alone |
| The second agent | `every-row` | Every combination of the facts in a move | Every row votes |
| The third agent | `from-counts` | The same, each different move counted once | The most specific row that applies |
| The fourth agent | `general-first` | The same as the third | The general row, unless a more specific row has held every time |

Two more recipes have no page: `every-combination` (stores everything, answers like the first)
and `hierarchy` (built by a hand-written procedure, kept as a target).

What worked: a hierarchy of assumptions read out of plain counts, curiosity that goes to the
move the agent is least sure about, and planning by chaining predictions. On the grid with a
wall the fourth agent reaches all 500 random trips, with routes 8% longer than the shortest.

What is missing, and why Part 2 exists:

- **Every agent is handed its one identity and its facts** (x and y). Everything learned so
  far is the continuity half of the conjecture. Nothing identifies anything.
- **The wall is ten unrelated rows.** "Something is in the way" cannot be said with x and y,
  so nothing learned at one side helps at the next, or at another wall.
- **Writing every combination does not scale.** Each fact added to the state multiplies the
  rows for one move by four: 127 with x and y, 32,767 with the four neighbours added.

## What Part 2 is

In the user's words: "part 2 we work backwards. we pre-define continuities for different
environment." For each world, write the continuities by hand first, in whatever facts make
them fewest. Then ask what an agent would need in order to arrive at them on its own.

Nothing has been started, and nothing below is agreed. These are the natural places to begin,
to be discussed with the user first:

1. The grid with a wall, described by what is to the left, right, above and below. Write the
   continuities by hand and count them. The findings page estimates 8. That number has never
   been measured.
2. The same world as things at places, with "two things cannot be in the same place". The
   estimate is about 5, also unmeasured.
3. Whether the fourth agent's way of answering still works on those facts, given that it can
   no longer write every combination.

The open questions are listed at the end of the findings page. `ROADMAP.md` has a provisional
list of later worlds: several things in one world, learning by watching, tic-tac-toe, checkers,
chess.

## Things to know before trusting a number

- **The standard test says less than it seems.** `bench` runs seeds 1 to 500, but the third
  and fourth agents' exploring hardly uses chance, so on the line and on the grid with a wall
  the 500 runs are one run repeated. Use `routes` in `src/runs/routes.ts`, which sends the
  agent on trips to random cells and compares each with the shortest route.
- **Second to third agent changed three things at once**: how rows are counted, which row
  answers, and how the agent explores. Which one gave which gain was never measured.
- **The fourth agent picks its general row by how many moves it has been right about.** Early
  on a row about a place could win over the row about the move. It did not happen in the usual
  exploring, but nothing rules it out.
- **"Held every time" suits a world with no chance in it.** In a world with chance the fourth
  agent would follow only its general rows.
- **The first page does not yet say** that a specific assumption is dropped once it fails,
  which is what the fourth agent does. Raise it with the user before changing that page.
- **Fig 1.5 on the first page is a drawing** of the shape the engine holds, not its output.

## Working in the code

- Layers import one way: `core`, then `worlds` and `agents`, then `runs`, then `experiments`
  and `web`. `tests/layers.test.ts` enforces it.
- **Add, do not edit.** A new idea is a new part and a new recipe. Parts used by an earlier
  recipe are not changed. Then pin its numbers in `tests/runs.test.ts`, run `npm run bench`,
  and give it a page.
- After any change to `core`, `agents`, `worlds` or `runs`, run `npm test`. It takes about 80
  seconds. The pinned results must not change.
- No text formatting below `src/web` and `src/experiments`.
- Pages are in `src/web/pages/`, registered in `index.ts`. Page ids, in order: `theory`,
  `implementation`, `remembering`, `voting`, `hierarchy`, `general-first`, `findings`. Page
  numbers come from that order and are written nowhere else.
- Some code is no longer used by any page and was left in place: the full-screen lab layout,
  the combinations panel, and the two recipes without pages. The viewer's hierarchy code still
  calls the specific rows `exceptions`.
- Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run bench`,
  `npm run demo -- 2d-walls --seed 3`.

## Git

Part 1 is on `main`, pushed to `origin`. The branch `part-1-pages` is at the same commit and
is where the work was done. Check `git status` and `git log` before starting.
