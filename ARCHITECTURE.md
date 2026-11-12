# How the code is organised

The code is in layers. A layer may import only from the layers listed beside it. A test
(`tests/layers.test.ts`) fails if a file breaks this.

| Layer | What it holds | May import from |
|---|---|---|
| `src/core/` | Facts, the knowledge base, states, seeded randomness | nothing |
| `src/worlds/` | Worlds and ready-made scenarios | `core` |
| `src/agents/` | The agent, its parts, and the recipe for each stage | `core` |
| `src/runs/` | Connects an agent to a world, records events, replays, benchmarks | `core`, `worlds`, `agents` |
| `src/experiments/` | Command-line programs | all of the above |
| `src/web/` | The site | all of the above |

Agents and worlds do not know about each other. Only a run brings them together.

## An agent is made of parts

`src/agents/parts.ts` defines five parts. Each one is a single decision about how the agent
works.

| Part | Decides |
|---|---|
| Representation | How a state becomes facts, and how a change is measured and applied |
| Storage | Which entries one observation is written to |
| Predictor | How a prediction is read out of the knowledge base |
| Explorer | Curiosity, confidence, and what to try next |
| Planner | How predictions are chained to reach a goal |

A **recipe** (`src/agents/recipes.ts`) is a named choice of parts. Each stage that runs has one.

## Rules for adding a stage

1. **Add, do not edit.** A new idea is a new part beside the old ones, and a new recipe that
   uses it. Parts used by an earlier recipe are not changed.
2. **Pin the numbers.** Add the new recipe's results to the pinned results in
   `tests/runs.test.ts`. The numbers of earlier stages must stay the same.
3. **Save the benchmark.** Run `npm run bench`. It writes `results/<recipe>.json`. Commit it.
4. **Give the stage a page.** A lab page names its recipe, so it keeps showing that stage's
   agent after later stages exist.

## The agent does not hold a world

The agent is handed observations and asked questions: what do you expect, what do you want to
try, how would you get there. A driver in `src/runs/drivers.ts` carries moves out. `explore` and
`pursue` let the agent act. `watch` feeds it moves it did not make. The agent cannot tell the
difference.

## Runs are events

A run reports structured events (`src/runs/events.ts`) and nothing else. No layer below `web`
or `experiments` produces text. `summarise` in `src/runs/summary.ts` works out everything a
view needs from the events alone.

A run is fully determined by its recipe, scenario, seed and commands, so `replay` can rebuild
it up to any point. The site's step-back and timeline rely on this.

## The viewer

`src/web/lab/` is split so one part can be worked on without the others.

| File | Does |
|---|---|
| `controller.ts` | Holds the run and the position in it. No drawing. |
| `lab.ts` | Arranges the regions and passes each what to show |
| `world-views/` | One drawing per kind of world. A board game adds its own here. |
| `panels/` | One file per region: state, timeline, knowledge (the stored table), lookup, learning |
| `words.ts` | Every piece of text made from engine data |
| `icons.ts` | Every icon the lab uses (Lucide), named in one place |

### What the viewer must keep true

- Two sides. Left is the state: what is happening. Right is the knowledge: what the agent has
  learned. A region belongs to one side.
- Each fact appears once, in the form that shows it best. A drawing beats a number, and a
  number beats a sentence.
- Every region is a titled panel with a fixed place. No popups, no tabs.
- All controls are in one bar under the world. Set-up (world, seed) is in the page header.
- Colour is used only for three marks: curiosity, goal and surprise.
- Nothing moves when a highlight or a selection changes. Highlights change colour only, never
  size, weight or spacing, and a panel keeps its height whatever it shows.
- The knowledge side is honest. The knowledge base is shown as it is stored: every row, every
  outcome, nothing grouped or renamed. Anything the code reads out of it (a lookup,
  confidence) is in its own panel and says how it is worked out.
- Anything shown can be traced: a prediction to its entries, an entry to the move that made it.
