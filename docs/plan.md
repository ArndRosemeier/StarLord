# StarLord roadmap

1. **Simulation core and headless runner** (this step). Game state, seeded RNG,
   command-driven turns, galaxy generation, the 13 renamed races, colony economy,
   research tiers, exploration and colonization, a basic AI split into automatable
   areas, and a CLI that runs AI vs AI games.
2. **Full MoO2 rules for the alpha.** Complete tech tree, outposts, ship design,
   tactical combat with auto-resolve, ground invasions, diplomacy, espionage,
   leaders, morale, pollution and terraforming, monsters and the endgame enemy,
   victory conditions. AI covering all of it, and automation for each area.
3. **Modern UI.** React screens with a PixiJS galaxy map behind a renderer
   interface (so a three.js view can replace it later), automation switches
   everywhere, race videos on race selection. Done: race selection, galaxy map,
   colonies, research, ship designer, fleets, diplomacy and council, espionage,
   leaders, empire and automation, turn reports with battle replays, an AI
   spectator mode, and browser save slots.
4. **Alpha polish.** Balance with batch runs (`pnpm balance`, see
   [balance.md](balance.md)), save/load, and multiplayer groundwork. Done: a
   first balance pass, browser saves that carry the game record, downloadable
   replays verified turn by turn, and a transport-agnostic lockstep host and peer.

## Next

- Done: custom races. Players spend 10 picks MoO2-style (drawbacks give up to 10 back) and borrow an existing race's portrait and video. Costs live in `packages/sim/src/data/racePicks.ts`.

- Iterate on balance with Arnd (race spread, late-game acceleration).
- Networked multiplayer: a WebSocket or WebRTC `Transport` for the lockstep host and peers,
  plus a lobby.
- A three.js `MapRenderer`.

## What the rules cover (step 2)

- **Economy:** farmers, workers and scientists; climate, minerals, gravity, pollution, morale,
  taxes, buildings with upkeep, buying, trade goods, housing, gold and gem deposits, artifacts.
- **Research:** 8 categories of 73 fields and 191 applications with the original costs; general fields, random breakthroughs between 1x and 2x the cost, repeatable hyper-advanced fields; creative and uncreative races; miniaturization.
- **Ships:** six hulls, beams, missiles, torpedoes, bombs, armor, shields, computers, specials,
  colony, outpost and troop modules, command points.
- **Combat:** round-based tactical battles on a 30x20 field with movement, range, shields,
  point defense and doctrine-driven retreat; planets fight with bases and shields; every battle
  is recorded for replay. Bombardment and ground invasion follow.
- **Expansion:** colony ships, outposts, colony bases, terraforming, Gaia transformation,
  artificial planets.
- **Diplomacy:** war, peace, alliance, trade and research treaties, attitudes that drift with
  borders, wars and race traits.
- **Espionage, leaders, random events.**
- **Monsters and endgame:** monster lairs, Orion and its Guardian (Death Ray), Vexari raids from
  turn 120, and a dimensional portal to strike their home.
- **Victory:** conquest, Galactic Council (two thirds of votes), defeating the Vexari, or score at the turn limit.

## Known simplifications

- Food is not pooled: freighters carry it from fed colonies to hungry ones, one food per ship, and the surplus
  is sold, as in MoO2. Ships repair completely when they spend a turn at a system with one of their owner's
  colonies or outposts, also as in MoO2.
- Humans command their battles unit by unit (or let them resolve by their combat doctrine); the turn stops at
  each battle and the player's orders go in with the turn's commands, so a recorded game replays it exactly.
- One race per colony (plus natives). Conquered people keep their race, grow by their own race's rules and
  assimilate over time; colonists can't be moved into a colony of another race.
- Where the original's rule could not be decoded StarLord uses an estimate, marked as such in
  `packages/sim/src/data` (for example how much a computer ruler covets one of your systems).
- The Tactics leader skill adds initiative, which only orders battles with the Ship initiative option; the
  original's battle code never reads the skill.
- Numbers have had one tuning pass (see balance.md); more will follow.

## Race names

Each race's video and portrait live in `public/races/<id>.mp4` and `public/races/<id>.webp`.

| StarLord | Archetype |
| --- | --- |
| Kyrrin | Avian pilots |
| Gorvath | Heavy-world brutes |
| Shadar | Shapeshifting spies |
| Lysari | Telepathic matriarchy |
| Quillan | Amphibian merchant clans |
| Terrans | Diplomatic generalists |
| Zhrikk | Hive insectoids |
| Kordex | Cyborg engineers |
| Felhari | Feline warrior caste |
| Ythari | Scholar savants |
| Draskar | Burrowing reptiles |
| Petrani | Silicon lifeforms |
| Thalassi | Aquatic mystics |
