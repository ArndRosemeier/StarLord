# StarLord

A Master of Orion 2 style 4X strategy game for the browser, written in TypeScript.
The first goal is a faithful MoO2 alpha with a modern, easier interface where the
player can hand any part of the game to automation. Later goals include
multiplayer and a 3D view.

## Layout

| Path | What it is |
| --- | --- |
| `packages/sim` | The game rules. Pure TypeScript with no browser code: game state, seeded RNG, commands, turn processing, galaxy generation, data tables. |
| `packages/ai` | Controllers that turn a player's view into commands. The AI and the player's automation are the same code. |
| `apps/cli` | Headless runner for all-AI games and balance batches. |
| `public` | Race videos, portraits and art. |
| `docs/plan.md` | Roadmap. |

## Getting started

```sh
pnpm install
pnpm test
pnpm sim --help
pnpm sim --turns 200                  # one all-AI game with status tables
pnpm sim --games 100 --turns 150      # batch run, race win rates
```

## Design rules

- **The sim only changes through commands.** Every player action (human, AI or
  automation) is a `Command`; `processTurn(state, orders)` returns a new state.
  That makes headless runs, replays, saves and lockstep multiplayer fall out naturally.
- **Deterministic.** All randomness comes from the seeded RNG stored in the state.
  Same seed and same orders give the same `stateHash`.
- **Fog of war by construction.** Controllers receive `playerView(state, id)`, never the full state.
- **Rules are data.** Races, planets, buildings, techs, ships and governments live in `packages/sim/src/data`.
- **Original names.** Races are renamed versions of the MoO2 archetypes. The art files in
  `public` still use the old names and are mapped through each race's `assetKey`.
