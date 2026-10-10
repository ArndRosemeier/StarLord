# Balance notes

Balance is measured with all-AI batch runs:

```sh
pnpm balance --games 20 --turns 250 --seed 7 --out mytest   # writes runs/mytest.json
```

The report averages every surviving empire at turns 25, 50, 75, 100, 150, 200 and 250,
counts how games end, and ranks races by average final score.

## First pass (step 4)

Baseline: 12 games, 5 empires, medium galaxy, 250 turns. After: 20 games, same setup.

| Turn | Colonies (before → after) | Pop | Industry | Research | Techs |
| --- | --- | --- | --- | --- | --- |
| 25 | 2.5 → 2.8 | 11.6 → 11.6 | 17.8 → 20.9 | 7.7 → 5.4 | 17.6 → 17.3 |
| 50 | 4.0 → 4.5 | 17.2 → 17.1 | 28.8 → 30.9 | 14.4 → 13.0 | 20.4 → 20.1 |
| 100 | 8.3 → 9.7 | 35.4 → 35.9 | 62.8 → 61.9 | 37.5 → 39.2 | 28.5 → 29.0 |
| 150 | 12.4 → 12.5 | 66.6 → 68.8 | 175 → 185 | 84 → 116 | 38.8 → 43.6 |
| 250 | 14.0 → 13.3 | 159 → 158 | 2155 → 1461 | 1297 → 1355 | 77.7 → 86.9 |

Treasuries at turn 250 fell from about 11,000 BC to about 1,200 BC, and fleets grew from 34 to 41 ships.
Games now end by score, council election and raider victory instead of by score alone.

Changes:

- **AI jobs bug.** When feeding the empire, the AI took farmers from workers first. Some
  homeworlds ended up with zero workers and could build nothing. Farmers now come from
  workers and scientists in the empire's chosen proportion.
- **AI personality comes from the race.** Science-minded races put more people into
  research and martial races are more aggressive, instead of a pure hash of the race id.
- **AI spends late-game wealth.** Peacetime fleets scale with industry, and a rich empire
  builds warships before trade goods.
- **Industry stacking.** Microlite Construction and Fusion Power Plant now give +0.5
  industry per worker instead of +1, and Deep Core Mining gives +1 instead of +3, since the
  industry buildings already provide most of the per-worker bonus. The morale cap is now +30%
  instead of +50%.
- **Feudal research penalty** is now -33% instead of -50%, because the AI can't yet exploit
  feudal's cheap ships.
- **Races with no economic picks** got one small bonus each: Kyrrin +50% growth, Gorvath +0.5
  farming, Shadar +1 industry, Lysari +1 science instead of -0.5 farming, Quillan +50% growth,
  and Felhari +1 industry.

## Open questions for the next pass

- **Race spread is still wide.** Average final scores range from about 12,000 (Ythari) to about 2,500
  (Lysari, Felhari). Creative research dominates. Military and spy races lag because the AI
  rarely turns combat strength into conquest. It's a choice between staying faithful to the MoO2 picks and
  rebalancing races around the current AI.
- **Late game accelerates sharply after turn 150.** Industry and research grow about 8x from
  turn 150 to 250 while population doubles.
- **Sieges re-fight every turn**, which gives about 1,300 combat reports per game. That's harmless for
  the sim but noisy in turn reports.
