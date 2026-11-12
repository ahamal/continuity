# Continuity

Read `ROADMAP.md` for the goal and stages, and `ARCHITECTURE.md` for the layers and the rules
for adding a stage. Follow both.

- Never edit a part that an earlier stage's recipe uses. Add a new part and a new recipe.
- After any change to `core`, `agents`, `worlds` or `runs`, run `npm test`. The pinned results
  in `tests/runs.test.ts` must not change.
- No text formatting below `src/web` and `src/experiments`. Lower layers report data.
- The viewer is a thinking tool. Keep the points under "What the viewer must keep true" in
  `ARCHITECTURE.md`.
- The theory is the user's. Describe it in their terms: identity, continuity, hierarchy,
  curiosity. Surprise is not a separate idea: a wrong prediction adds a more specific
  continuity, and the hierarchy does the rest.

Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run bench`,
`npm run demo -- 2d-walls --seed 3`.
