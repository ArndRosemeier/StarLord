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
   everywhere, race videos on race selection.
4. **Alpha polish.** Balance with batch runs (`pnpm sim --games N`),
   save/load, and multiplayer groundwork.

## Known simplifications in step 1

- Food is pooled empire-wide (stands in for MoO2 freighters).
- No combat yet, so combat traits have no effect and games end on the turn limit by score.
- Morale, pollution cleanup, outposts and the bulk of the tech tree come in step 2.
- Race trait values are first-pass approximations; early batch runs show the
  growth and industry races well ahead, as expected while combat is missing.

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
