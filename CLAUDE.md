# StarLord

MoO2-style 4X in TypeScript. pnpm workspace: `packages/sim` (pure rules, no DOM),
`packages/ai` (controllers), `apps/cli` (headless runner). See README.md and docs/plan.md.

- Run `pnpm test` and `pnpm typecheck` before committing.
- Never use `Math.random` or `Date` in `packages/sim` or `packages/ai`; use the state's `Rng` so games stay deterministic.
- State changes only through `Command`s and `processTurn`. Controllers read `playerView`, never the full state.
- Game numbers belong in `packages/sim/src/data`, not inline in logic.
- Use original names only; never the MoO2 race names in code, file names or player-facing text.
