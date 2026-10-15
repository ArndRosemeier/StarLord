# StarLord

MoO2-style 4X in TypeScript. pnpm workspace: `packages/sim` (pure rules, no DOM),
`packages/ai` (controllers), `apps/cli` (headless runner). See README.md and docs/plan.md.

- Run `pnpm test` and `pnpm typecheck` before committing.
- Never use `Math.random` or `Date` in `packages/sim` or `packages/ai`; use the state's `Rng` so games stay deterministic.
- State changes only through `Command`s and `processTurn`. Controllers read `playerView`, never the full state.
- Game numbers belong in `packages/sim/src/data`, not inline in logic.
- Use original names only; never the MoO2 race names in code, file names or player-facing text.
- Every PR that will merge to main adds one "What's new" entry: a new file in `apps/web/src/changelog/entries/` named
  `YYYY-MM-DD-HHMM-short-slug.md` (UTC time of merging; rename it if the PR waits), with an optional `# Headline` and
  `- ` bullets written for players. Never edit other entries. Each entry is one build and adds 0.001 to the version. The galaxy map glowup entry pins `Version: 1.000`, so builds after it are 1.001, 1.002, ...; only a deliberate milestone gets its own `Version:` line.
