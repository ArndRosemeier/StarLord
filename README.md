# StarLord

A Master of Orion 2 style 4X strategy game for the browser, written in TypeScript.
The first goal is a faithful MoO2 alpha with a modern, easier interface where the
player can hand any part of the game to automation. Later goals include
multiplayer and a 3D view.

**Play it free in your browser: https://apps.futuremagic.de/starlord/**

## Layout

| Path | What it is |
| --- | --- |
| `packages/sim` | The game rules. Pure TypeScript with no browser code: game state, seeded RNG, commands, turn processing, galaxy generation, data tables. |
| `packages/ai` | Controllers that turn a player's view into commands. The AI and the player's automation are the same code. |
| `apps/cli` | Headless runner for all-AI games and balance batches. |
| `apps/web` | The browser game: React screens, a PixiJS galaxy map and a three.js battle view (reusable 3D layer in `src/three`; `/dev/battle.html` on the dev server previews battles). The sim and AI run in the page. |
| `public` | Art and audio. Race videos and portraits are in `public/races`; key art, planets, leader portraits and music in `public/art`, `public/planets`, `public/leaders` and `public/audio`. |
| `scripts` | `gen-assets.mjs` regenerates the art and music from the prompts in `assets.json` through OpenRouter (needs `OPEN_ROUTER_KEY` and ffmpeg). |
| `docs/plan.md` | Roadmap. |

## Getting started

```sh
pnpm install
pnpm dev                              # play in the browser at http://localhost:5173
pnpm build                            # static build in apps/web/dist
pnpm test
pnpm sim --help
pnpm sim --turns 200                  # one all-AI game with status tables
pnpm sim --games 100 --turns 150      # batch run, race win rates
pnpm sim:events --games 8             # what happens in a game: wars, invasions, spies, rejected commands
pnpm balance --games 20               # balance report: empire growth over time, endings, race scores
pnpm soak --seeds 2                   # games across galaxy sizes x empire counts, checked every turn for crashes and broken rules
pnpm sim --turns 200 --record runs/g.json && pnpm replay runs/g.json   # record a game and verify its replay
```

## Design rules

- **The sim only changes through commands.** Every player action (human, AI or
  automation) is a `Command`; `processTurn(state, orders)` returns a new state.
  That makes headless runs, replays, saves and lockstep multiplayer fall out naturally.
- **Deterministic.** All randomness comes from the seeded RNG stored in the state.
  Same seed and same orders give the same `stateHash`.
- **Fog of war by construction.** Controllers receive `playerView(state, id)`, never the full state.
- **The UI is just another player.** The browser holds the game, queues the human's
  commands for the turn and shows `playerView` with those commands already applied
  (`previewOrders`), so screens never touch the state directly.
- **Games are records.** A game is its starting options plus every turn's orders
  (`GameRecord`), with a state hash per turn. Replays rebuild it exactly, and the lockstep
  host/peer in `packages/sim/src/lockstep.ts` sends only orders between players and compares
  hashes to catch desyncs.
- **Online games over GameHub.** `apps/web/src/net` plays games with friends through the GameHub
  relay (games.futuremagic.de): the room's snapshot is the packed game record and each turn one
  delta, turns are simultaneous, the host adds the computer empires, and players get their empire
  back after a reload through a seat token in the browser. `pnpm online-e2e` runs two headless
  players against the live server.
- **Renderer behind an interface.** Screens hand the map a `MapScene`; `PixiMapRenderer`
  draws it in 2D and a three.js renderer can implement the same `MapRenderer` interface.
- **Rules are data.** Races, planets, buildings, techs, ships and governments live in `packages/sim/src/data`.
- **Original names.** Races are renamed versions of the MoO2 archetypes. Their media
  lives in `public/races`, named by race id.

## License

StarLord is open source under the [MIT License](LICENSE). It is a fan tribute inspired by
Master of Orion II and is not affiliated with or endorsed by the owners of Master of Orion.
