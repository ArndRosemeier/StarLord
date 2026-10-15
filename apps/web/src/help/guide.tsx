import type { ReactNode } from "react";
import { ALL_DOMAINS, DOMAIN_INFO, STRATEGIES } from "@starlord/ai";
import {
  OBJECTIVES, RACES, RESEARCH_GROUP_NAMES, SHIP_SPECIALTIES, SPECIALS_BY_ID, TEMPERAMENT_ORDER, TEMPERAMENT_ROLL, TEMPERAMENT_ROWS, WEAPON_LEANS,
  type ResearchGroup, ANDROIDS, ASSIMILATION, PATIENCE, TEMPERAMENTS, TREATY_ANSWER, BUY_PRICE_PER_POINT, GROWTH, SPECIAL_INCOME, BASE_COMMAND_POINTS, BASE_SCAN_RANGE, BLOCKADE_PENALTY, BOMB_DAMAGE_PER_HIT,
  CAPTURE_TECH, COMMAND_OVERAGE_COST, SPY, COUNCIL, COUNCIL_FIRST, AI_SURRENDER, SURRENDER,
  BOARDING, DEPLOY, EXPLOSION, HULLS_BY_ID, RETREAT, SIDE_ATTACK_BY_IMMOBILE_SIZE, STATION_ARMS, ANTI_MISSILE, BOMBARD_ROUNDS,
  COMBAT_BOMB_RANGE, CRAFT, DAMAGE, PLANET_POPULATION_HP,
  COUNCIL_INTERVAL, COUNCIL_MAJORITY, CREW, EVENT_START, FIGHTER_GARRISON, EVENT_TIMING, FIELD_HEIGHT, FIELD_WIDTH, FREIGHTERS, HERO_SKILLS, HEROES, EVENT_NUMBERS,
  JUMP_GATE_BONUS, LEADER_RULES, LEVEL_XP, MAX_LEADERS, MAX_QUEUE, MAX_ROUNDS, MILITIA_PER_POP, BASE_EQUIPMENT, SPECIAL_UNIT_RATING, COMMANDO_INVASION, SCORE, BANKRUPTCY, CAPTURE_LOSSES, MARINES_PER_TRANSPORT, REBEL_GARRISON_MAX, BUILDINGS_BY_ID,
  MISSILE_SPEED, NEBULA_SPEED, BLACK_HOLE_RADIUS, PEACE_TREATY_TURNS, PICK_VALUES, PLANET_INSTALLATION_HP, PROJECT_COSTS, PROPOSAL_LIFETIME, RESEARCH,
  SPORE_KILL_CHANCE_PER_POINT, STAR_COUNTS, STARTING_SHIPS, STARTING_STATION, BUILDINGS, BASE_SCRAP_REFUND, BUILDING_SCRAP, mapSize, SUCCESS_THRESHOLD, TAX_BC_PER_INDUSTRY, TAX_PER_POP, TAX_STEPS,
  TRADE_GOODS_RATE, TRAIT_EFFECTS, GOVERNMENTS, REFIT, DIFFICULTIES, DIFFICULTY_ORDER, RESEARCH_PER_SCIENTIST, AI_PEACE, EVENTS, MAX_WEAPON_SLOTS, COMM_REDIRECT_RANGE, HULLS, TECHS, TREATY_YIELD, TROOPS, RELATION, RELATION_EVENTS, TREATY_WARMTH, COUNCIL_VOTE, COVET, PAID_WAR, abilityValue, type HeroSkill, type HeroSkillGroup,
} from "@starlord/sim";
import { fmt, pct } from "../ui/format";
import { OTHER_KEYS, SHORTCUTS } from "../ui/shortcuts";
import { difficultyText, galaxyAgeText, techLevelText } from "../ui/explain";
import { FLASH_LEGEND } from "../map/flashes";
import { LONE_CLAIM, TERRITORY_REACH } from "../map/territory";
import { AUTOSAVES_KEPT } from "../game/saves";
import { REPLAY_SPEEDS } from "../game/prefs";
import type { GuideSlug } from "./entries";
import { HelpLink } from "./HelpDialog";

/**
 * Hand-written rules explanations. Numbers come from the rules modules so the
 * text follows the game when it is rebalanced.
 */

/** Governments grouped by one of their numbers, e.g. "50% under Feudal and Confederation, 35% under …". */
function byGovernment(value: (g: (typeof GOVERNMENTS)[keyof typeof GOVERNMENTS]) => number, unit: string, skip?: number): string {
  const groups = new Map<number, string[]>();
  for (const g of Object.values(GOVERNMENTS)) {
    const v = value(g);
    if (v === skip) continue;
    groups.set(v, [...(groups.get(v) ?? []), g.name]);
  }
  return [...groups].map(([v, names]) => `${v}${unit} under ${listAnd(names)}`).join(", ");
}

function startCount(designId: string): number {
  return STARTING_SHIPS.filter((s) => s.designId === designId).reduce((n, s) => n + s.count, 0);
}

function listAnd(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;
const Ul = ({ children }: { children: ReactNode }) => <ul className="help-ul">{children}</ul>;
const Key = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

export const GUIDE: Record<GuideSlug, () => ReactNode> = {
  start: () => (
    <>
      <P>
        You lead one of the races of the galaxy from a single homeworld. Explore, settle new worlds, out-research and
        out-build your rivals, and win by conquest, by election, by defeating the raiders or on score when time runs out
        (see <HelpLink to="guide:victory" />).
      </P>
      <h3>Your first turns</h3>
      <P>
        Every empire starts, at every tech level, with{" "}
        {startCount("scout")} scouts, {startCount("colonyShip")} colony ship and a{" "}
        {BUILDINGS.find((b) => b.id === STARTING_STATION)?.name ?? STARTING_STATION} over its homeworld. In a pre-warp start
        the ships wait at home until a drive is researched.
      </P>
      <Ul>
        <li>Send your scouts to nearby stars from the <b>Galaxy</b> map: click the fleet, then click a star.</li>
        <li>Pick a technology on the <b>Research</b> screen. The <HelpLink to="page:techTree" /> shows everything ahead. If you end a turn with no field chosen, you are asked for one so no research is lost.</li>
        <li>Queue buildings or a colony ship on the <b>Colonies</b> screen and balance farmers, workers and scientists. A colony with nothing queued sells its industry as Trade Goods; ending the turn lists such colonies until you turn that alert off for the game (in the alert itself or the <b>Game</b> menu).</li>
        <li>Send your colony ship to a good planet, open its star and press <b>Colonize</b> on the planet you want.</li>
        <li>End the turn with the button at the top right or <Key>Ctrl</Key>+<Key>Enter</Key>.</li>
      </Ul>
      <P>
        When a new turn starts, anything you need to see opens by itself: your battles, Galactic News, research
        breakthroughs, leaders offering their services, council sessions and rulers asking for an audience (see{" "}
        <HelpLink to="guide:turn" />), and stars on the map light up where something happened.
      </P>
      <P>
        Anything you'd rather not micromanage can be handed to the advisors on the <b>Empire &amp; automation</b> screen
        (see <HelpLink to="guide:automation" />). Game options, saving and settings are explained in{" "}
        <HelpLink to="guide:setup" />, every screen and key in <HelpLink to="guide:controls" />.
      </P>
      <h3>Using this encyclopedia</h3>
      <P>
        Every table here is generated from the game's own rules data, so the numbers are always the ones the game uses.
        Search from the box on the left, follow links between pages, and use ← → (or <Key>Alt</Key>+arrows) to go back
        and forth. <Key>F1</Key> opens and closes it from anywhere.
      </P>
    </>
  ),

  setup: () => (
    <>
      <h3>New game</h3>
      <P>
        Pick a race (or build your own in the race builder), then the options below. Every option shows what it does
        when you point at it.
      </P>
      <Ul>
        <li><b>Galaxy size</b>: {(Object.keys(STAR_COUNTS) as (keyof typeof STAR_COUNTS)[]).map((k) => `${k} ${STAR_COUNTS[k]} stars on ${Math.round(mapSize(k).width)} × ${Math.round(mapSize(k).height)} parsecs`).join(", ")}. See <HelpLink to="page:stars" /> for how the galaxy is laid out.</li>
        <li><b>Galaxy age</b> sets the mix of star colors, and with it planets and minerals:
          <Ul>{(["young", "average", "old"] as const).map((a) => <li key={a}>{galaxyAgeText(a)}</li>)}</Ul>
        </li>
        <li><b>Opponents</b>: how many computer empires play against you.</li>
        <li><b>Difficulty</b> changes only what the computer empires get and how they deal with you; your own rules stay the same, and so does the score:
          <Ul>{DIFFICULTY_ORDER.map((d) => <li key={d}>{difficultyText(d)}</li>)}</Ul>
          Custom races need {DIFFICULTIES[DIFFICULTY_ORDER.find((d) => DIFFICULTIES[d].customRaces) ?? "average"].name} difficulty or harder.
        </li>
        <li><b>Tech level</b> sets how far every empire has come:
          <Ul>{(["preWarp", "average", "advanced"] as const).map((t) => <li key={t}>{techLevelText(t)}</li>)}</Ul>
          Whatever the level, every empire starts with {startCount("scout")} scouts, {startCount("colonyShip")} colony ship and a{" "}
          {BUILDINGS.find((b) => b.id === STARTING_STATION)?.name ?? STARTING_STATION}.
        </li>
        <li><b>Turn limit</b>: off by default, as in the original. When on, the highest score wins once it is reached (<HelpLink to="guide:victory" />).</li>
        <li><b>Seed</b>: the same seed and options make the same galaxy.</li>
        <li><b>Monsters</b> (lairs and the guardian of Orion), <b>Raiders</b>, the <b>Galactic council</b> and <b>Random events</b> can each be switched off. <b>Ship initiative</b> changes who acts first in battle (<HelpLink to="guide:combat" />).</li>
        <li><b>Watch an AI game</b> starts a game where every empire is a computer player and you watch.</li>
      </Ul>
      <h3>Saving and loading</h3>
      <P>
        Save from the <b>Game</b> screen, or download a save file to keep or move to another browser. With autosave on,
        the game saves itself at the start of every turn and when you leave the page; the newest {AUTOSAVES_KEPT} autosaves
        are kept, and when the browser's storage is full the oldest autosaves make room first, never your own saves.{" "}
        <b>Load game</b> on the title screen lists every save in this browser, newest first, to load or delete, and
        loads save files too. A replay file holds every turn's orders from the start; load it there to watch the game
        again. <b>Title</b> on the new game screen takes you back to the title screen.
      </P>
      <h3>Settings</h3>
      <P>
        The settings on the <b>Game</b> screen (and on the title screen) hold for every game in this browser:
      </P>
      <Ul>
        <li><b>Sound</b>: music and effect volume. Each mood of the galaxy map has its own tracks, shuffled without repeats.</li>
        <li><b>Replay speed</b> of battles: {REPLAY_SPEEDS.map((x) => `${x}×`).join(", ")}.</li>
        <li><b>Turn flashes</b>: as a turn starts, stars light up where something happened to you, colored by what it was: {FLASH_LEGEND.map((l) => l.text).join(", ")}. Choose bursts, a gentle glow or off; with reduced motion asked for by your system, bursts play as a glow.</li>
        <li><b>Autosave</b>, on or off.</li>
      </Ul>
      <P>
        Two choices on the <b>Game</b> screen belong to the current game: whether ending a turn warns about colonies that
        only make Trade Goods, and <b>Let me command my battles</b> (<HelpLink to="guide:combat" />).
      </P>
      <h3>Hall of Fame</h3>
      <P>
        When a game ends, the final standings show every empire's score, broken down, and your best final scores go to the
        Hall of Fame in this browser (<HelpLink to="guide:victory" />).
      </P>
    </>
  ),

  controls: () => (
    <>
      <h3>Screens</h3>
      <P>Every screen has a button at the top and a key:</P>
      <table className="help-table">
        <tbody>
          {[...SHORTCUTS.map((k) => ({ label: k.label, what: k.what })), ...OTHER_KEYS].map((k) => (
            <tr key={k.label}><td><Key>{k.label}</Key></td><td>{k.what}</td></tr>
          ))}
        </tbody>
      </table>
      <P>
        Letters do nothing while you type in a text field. The <b>Planets</b> screen lists every planet you know with what
        it is, how far it is and whether your ships reach it, and settles it with a ship in orbit or sends your nearest idle
        colony or outpost ship. The <b>Info</b> screen compares you with the empires you are in contact with, now and over
        time. Lists such as Colonies, Fleets and Planets sort by any column header.
      </P>
      <h3>Galaxy map</h3>
      <Ul>
        <li>Drag to pan, mouse wheel to zoom.</li>
        <li>Click a star to open its system in 3D: the star, every planet, colonies, stations and fleets. Drag to turn it, scroll to zoom, click a planet to follow it and double-click to see the whole system. From the panel beside it you colonize, invade, pick fleets and run your own colonies.</li>
        <li>The <b>Last turn</b> panel in the sidebar lists what happened; click a line to jump there. Random events still in play are pinned to the top left of the map with what they do and when they end; click one to go to its system.</li>
        <li>Click one of your fleets, then click any star to send it there. Stars in fuel range are highlighted and the route is previewed.</li>
        <li><Key>Esc</Key> or a click on empty space deselects the fleet.</li>
        <li>Shift-click fleets to select several; they all take the next star order.</li>
        <li>Buttons on the map show your fuel range and scanner coverage over the whole map, jump to your next fleet without orders and center on your next colony.</li>
        <li><b>Territory</b>: each empire's space is shaded in its color inside a glowing border. Every colonized system claims about {LONE_CLAIM.toFixed(1)} parsecs around it; colonies up to {(TERRITORY_REACH * 2).toFixed(1)} parsecs apart add their pull together, and where two empires meet the stronger pull takes the space. It is a picture of who holds what and has no effect on the rules.</li>
        <li>Star size shows its class, from big blue giants down to small brown dwarfs. Names of colonized systems take their owner's color. Your fleets under way leave an engine trail, and a ripple marks where they will arrive.</li>
      </Ul>
      <h3>Colonies</h3>
      <Ul>
        <li>Move people between farmers, workers and scientists with − and +, or drag them between the rows: grabbing an icon takes it and every icon to its right. While you drag, the colony's food, industry and research after the move are shown.</li>
        <li>Click a building to scrap it (<HelpLink to="guide:colonies" />).</li>
      </Ul>
      <h3>Tablets and touch screens</h3>
      <Ul>
        <li>Drag with one finger to pan the map; pinch with two to zoom. The 3D views orbit with one finger, zoom with a pinch and reset with a double tap.</li>
        <li>Tap a star or fleet as you would click it. Hold a finger on a fleet to add it to the selection, or switch on <b>Select several</b> at the bottom of the map so every tap adds or removes a fleet.</li>
        <li>Hold a finger on any button, number or control to see the tooltip a mouse would show; lifting the finger then does not press it.</li>
        <li>The <b>?</b> button stands in for <Key>F1</Key> and <b>End turn</b> for <Key>Ctrl</Key>+<Key>Enter</Key>. The ✎ button next to a fleet's name renames it.</li>
      </Ul>
      <h3>Everywhere</h3>
      <Ul>
        <li><Key>Ctrl</Key>+<Key>Enter</Key> ends the turn.</li>
        <li><Key>F1</Key> or the <b>?</b> button opens this encyclopedia; <Key>Esc</Key> closes it.</li>
        <li>Orders given this turn can be taken back with <b>Undo</b> next to the turn button until you end the turn.</li>
        <li>Saving, autosave and settings: see <HelpLink to="guide:setup" />. Battle keys are listed under <HelpLink to="guide:combat" />.</li>
      </Ul>
    </>
  ),

  turn: () => (
    <>
      <P>When everyone has ended their turn, the galaxy moves in this order:</P>
      <ol className="help-ul">
        <li>Everyone's orders are carried out; who goes first rotates each turn.</li>
        <li>Ships orbiting your own systems are repaired.</li>
        <li>Raiders may strike.</li>
        <li>Fleets move.</li>
        <li>Space battles are fought wherever hostile fleets or armed planets meet (<HelpLink to="guide:combat" />).</li>
        <li>Bombing and invasions of colonies whose defenses are down (<HelpLink to="guide:invasion" />).</li>
        <li>Colonies produce food, industry, research and BC; queues advance, populations grow, research completes.</li>
        <li>Spies act, diplomatic relations drift, leaders offer their services, the council may vote.</li>
        <li>Random events, then surrenders take effect, then empires with no populated colonies left are eliminated (outposts and colony ships don't count).</li>
      </ol>
      <h3>When the turn waits for you</h3>
      <Ul>
        <li>At every battle you take part in, if you command your battles: command it or let it resolve (<HelpLink to="guide:combat" />).</li>
        <li>When your fleets hold the orbit of an enemy colony: bombard, use biological weapons, destroy the planet or hold fire (<HelpLink to="guide:invasion" />).</li>
        <li>Before it ends: if research points would be lost with no field chosen, and, while that alert is on, if colonies make nothing but Trade Goods.</li>
        <li>In a council session the turn does not end until you have declared your votes (<HelpLink to="guide:council" />).</li>
      </Ul>
      <h3>As the new turn starts</h3>
      <P>These open by themselves, one after another, so nothing goes unseen:</P>
      <ol className="help-ul">
        <li>Every battle you fought, to watch; the turn report keeps them for replay.</li>
        <li>Galactic News: the random events of the turn (<HelpLink to="guide:events" />).</li>
        <li>Research breakthroughs, then the Research screen to pick the next field unless research is automated.</li>
        <li>Leaders offering their services introduce themselves (<HelpLink to="guide:leaders" />).</li>
        <li>The council, when it is in session or has just voted.</li>
        <li>Rulers asking for an audience: on first contact, when they declare war and with proposals (<HelpLink to="guide:diplomacy" />).</li>
        <li>Finished colony bases and artificial planets asking where they go.</li>
      </ol>
      <P>Then the stars on the map flash where something happened, unless turn flashes are off (<HelpLink to="guide:setup" />).</P>
    </>
  ),

  colonies: () => (
    <>
      <h3>Jobs</h3>
      <P>
        Every unit of population works as a farmer, worker or scientist. Farmers grow food according to the planet's
        climate, workers make industry according to its minerals, and scientists make research ({RESEARCH_PER_SCIENTIST} points each before
        bonuses). Race picks, techs, buildings, the government, morale, gravity and an administrator all modify the
        result, but every unit makes at least 1, farmers only where farming is possible at all: barren, radiated and toxic
        worlds grow nothing until Biomorphic Fungi. See <HelpLink to="page:planets" /> and{" "}
        <HelpLink to="page:planetTraits" />.
      </P>
      <h3>Androids</h3>
      <P>
        Cybertechnics lets colonies build android farmers, workers and scientists ({PROJECT_COSTS.android} production each).
        An android does its one job {ANDROIDS.bonus} points better than a normal unit would on that planet, but gets no
        race bonuses. It eats no food, costs {ANDROIDS.industryUpkeep} industry a turn, ignores morale, pays no tax and
        takes up room toward the colony's maximum population.
      </P>
      <h3>Production</h3>
      <P>
        Industry, after pollution and taxes, goes into the colony's build queue (up to {MAX_QUEUE} items). A colony
        finishes at most one item per turn; extra production carries into the next. With an empty queue, or with
        Trade Goods first, the turn's production becomes BC at {pct(TRADE_GOODS_RATE)}; production already stored stays
        for the next item. Housing turns production into population
        growth instead. The <b>⟳</b> button on a ship or project turns on repeat build: it is built again every time
        it finishes and stays first in the queue until you remove it or the rules allow no more of it (a portal is
        built once, terraforming stops at the best climate). <b>Buy</b> completes the first item for BC: each missing point costs {BUY_PRICE_PER_POINT[0]} BC in the
        item's last half, {BUY_PRICE_PER_POINT[1]} BC from 10% to half done and {BUY_PRICE_PER_POINT[2]} BC below 10%,
        so buying from scratch costs about four times the item. Upgrading a station or planetary shield costs only the
        difference to the one it replaces.
      </P>
      <P>
        The build list only offers buildings that would do something at that colony: a Gravity Generator only where the
        planet's gravity hurts its people or androids, pollution cleanup only where the colony can pollute, morale
        buildings only under governments with morale, an Alien Management Center only where aliens or natives live. See{" "}
        <HelpLink to="page:buildings" /> and <HelpLink to="page:projects" />.
      </P>
      <h3>Growth</h3>
      <P>
        Population grows fastest when a colony is half full and stops at its maximum. Each 1,000k of growth adds one
        population unit. A newcomer farms if the colony would be short of food with one more mouth or your empire has
        no food to spare; works in industry if the colony can't cover its cybernetic or android upkeep; and otherwise
        joins industry or research at random, in the proportion those jobs already have. A newly founded colony splits
        its non-farmers evenly between industry and research.
      </P>
      <h3>Morale</h3>
      <P>
        Every 10% of morale adds or removes 10% of a colony's food, industry, research and population taxes. It comes
        from the government, buildings, techs and administrators. {listAnd(Object.values(GOVERNMENTS).filter((g) => g.ungarrisonedPenalty > 0).map((g) => g.name))} empires lose{" "}
        {Math.max(...Object.values(GOVERNMENTS).map((g) => g.ungarrisonedPenalty))}% on colonies without a Marine or Armor Barracks. A colony where natives live among settlers loses{" "}
        {ASSIMILATION.multiRacePenalty}% unless it has an Alien Management Center. Losing the Capitol costs morale on every
        colony until it is rebuilt: {byGovernment((g) => g.capitalLossMorale, "%", 0)}.{" "}
        {listAnd(Object.values(GOVERNMENTS).filter((g) => g.noMorale).map((g) => g.name))} have no morale at all, good or bad. Androids ignore morale.
      </P>
      <h3>Conquered people</h3>
      <P>
        People on a captured colony are aliens at first and work at {ASSIMILATION.alienPenalty}% less than normal. They join
        your empire one unit at a time: every {byGovernment((g) => g.assimilationTurns, " turns")}. An Alien Management Center makes it
        every 2 turns for anyone; charismatic rulers are twice as fast, repulsive ones half as fast, and telepaths
        assimilate them at once, as does anyone taking a feudal colony. Until then aliens may revolt, more often the more
        of them there are and half as often with an Alien Management Center; if they beat your garrison the colony goes
        back to its old owner.
      </P>
      <h3>Pollution</h3>
      <P>
        Industry above 4 × the planet's size factor pollutes, and half of the excess is lost. A Pollution Processor
        counts only half of the industry, an Atmospheric Renewer a quarter, both together an eighth. Nano Disassemblers
        double every planet's tolerance, Core Waste Dumps end pollution on their colony, the Recyclotron's extra industry
        never pollutes, and tolerant races never pollute at all.
      </P>
      <h3>Colony and outpost bases</h3>
      <P>
        A finished Colony Base or Artificial Planet asks which free planet in the system it goes to, showing
        what each would become; with only one free planet it settles there by itself. A base whose planets were all taken
        before it is used is scrapped for {pct(BASE_SCRAP_REFUND)} of its cost.
      </P>
      <h3>Outposts</h3>
      <P>
        Outposts hold no population and produce nothing, but they claim the planet, extend your fuel and scanner range
        and count for score. Outpost ships can claim any free planet, asteroid belts and gas giants included; colony
        ships need a habitable world. Any colony in a system with an asteroid belt or gas giant can build an{" "}
        <HelpLink to="project:artificialPlanet" />, which turns one into a barren planet colonists can live on. No
        outpost is needed first, and an outpost already there stays an outpost on the new world.
      </P>
      <h3>Scrapping buildings</h3>
      <P>
        Click a building on the Colonies screen to scrap it. It pays back {pct(BUILDING_SCRAP.refund)} of the
        building's base cost and its upkeep stops, but its effect is gone. Only {BUILDING_SCRAP.perColonyPerTurn} building
        per colony can be scrapped each turn, and never the Capitol. Debt sells buildings by itself at the same rate.
      </P>
    </>
  ),

  economy: () => (
    <>
      <h3>BC income</h3>
      <P>
        Each population pays {fmt(TAX_PER_POP, 1)} BC a turn before race picks; morale raises or lowers that tax. The tax
        rate on the Empire screen ({TAX_STEPS.map(pct).join(", ")}) takes that share of every colony's industry and pays{" "}
        {fmt(TAX_BC_PER_INDUSTRY, 1)} BC for each point. Gold and gem deposits pay {SPECIAL_INCOME.gold} and {SPECIAL_INCOME.gems}{" "}
        BC, and trade treaties add more (<HelpLink to="guide:diplomacy" />). Democracy, Federation, the Spaceport, Stock
        Exchange and Galactic Currency Exchange each add a share of a colony's population tax and deposits. Trade Goods pay
        half the production, rounded up, whatever the bonuses.
      </P>
      <h3>Costs</h3>
      <Ul>
        <li>Every building has BC upkeep each turn: a quarter more on radiated and desert worlds, half more on toxic ones.</li>
        <li>Freighters cost {fmt(FREIGHTERS.upkeepInUse, 1)} BC each (rounded down in total) for every turn they are carrying something; idle ones are free.</li>
        <li>Hired leaders draw a salary (<HelpLink to="guide:leaders" />).</li>
        <li>Every command point your ships use over your limit costs {COMMAND_OVERAGE_COST} BC a turn (<HelpLink to="guide:fleets" />).</li>
      </Ul>
      <P>
        If the treasury goes below zero, buildings are sold off for {pct(BANKRUPTCY.refund)} of their cost until the
        books balance (computer empires also get their difficulty level in BC per sale): first buildings with upkeep,
        then any but the Capitol, always the least valuable first. Farms, factories, Biospheres, morale buildings and a
        colony's only barracks count as more valuable than their cost.
      </P>
      <h3>Food and freighters</h3>
      <P>
        Each population eats 1 food (cybernetic races half, lithovores and androids none). Food doesn't move by itself:
        a Freighter Fleet ({PROJECT_COSTS.freighterFleet} production) adds {FREIGHTERS.perFleet} freighters, and each
        carries {FREIGHTERS.foodPerShip} food a turn from colonies with a surplus to hungry ones. A colony whose need is not
        met loses {GROWTH.starvationK}k population a turn for each food it lacks; a random worker or scientist dies first, farmers only when nobody else is left. The empire's net surplus (all food grown outside blockades minus all eaten there, hungry colonies included) is sold for {fmt(TRAIT_EFFECTS.normalFoodBc, 1)}{" "}
        BC a unit, rounded down ({fmt(TRAIT_EFFECTS.traderFoodBc, 1)} for fantastic traders). A blockaded system can neither send nor receive.
      </P>
      <P>
        Freighters also move colonists to another colony of the same race: each colonist needs {FREIGHTERS.perColonist} idle
        freighters for the trip, produces nothing on the way, and dies if the destination is full on arrival.
      </P>
    </>
  ),

  research: () => (
    <>
      <P>
        Research is organised in eight categories, each a chain of fields. You research one field at a time; when it
        completes you learn its applications and the next field of that category opens. Every field has its own cost.
        See the <HelpLink to="page:techTree" /> for the whole tree with costs, and{" "}
        <HelpLink to="page:techList" /> for every application's effect.
      </P>
      <Ul>
        <li>General fields (the basic ones) give every race all their applications. Every empire starts with them.</li>
        <li>In any other field you pick one application; the others can only be stolen or captured later.</li>
        <li><HelpLink to="trait:creative">Creative</HelpLink> races learn every application of a field they finish.</li>
        <li><HelpLink to="trait:uncreative">Uncreative</HelpLink> races get one random application instead of choosing.</li>
        <li>
          Until the research points pass a field's cost, the chance of a breakthrough is 0%. After that every turn rolls a
          chance that is how far past the cost you are, as a percent of it (1% just past, certain at {RESEARCH.maxCostMult}x the
          cost), so it climbs each turn. Points past the cost are lost when the breakthrough comes, and points made while no
          field is chosen are lost too.
        </li>
        <li>
          When a category is finished, its hyper-advanced field ({fmt(RESEARCH.hyperCost)} RP, {fmt(RESEARCH.hyperCostStep)} more for each further level) can be researched again
          and again: each level makes that category's components smaller, and the first adds {RESEARCH.hyperScore} to the score.
        </li>
        <li>Applications you skipped can still be gained: stolen by spies, captured with a colony, found on a derelict ship, or learned from the guardian of Orion.</li>
      </Ul>
      <P>
        The top bar shows the points toward the current field, and once they pass its cost, this turn's chance of the
        breakthrough. A breakthrough is celebrated as the next turn starts, with what you learned (and anything gained
        another way that turn), and then the Research screen opens so you pick the next field, unless research is
        automated.
      </P>
      <h3>Miniaturization</h3>
      <P>
        Every later level you research in the field that gave a ship component counts as a refinement of it, and so does
        each hyper-advanced level of that category. Refinements make the component smaller and cheaper, down to about a
        quarter of its first size and cost, and open the stronger weapon modifications. Old weapons become cheap filler
        on big hulls.
      </P>
    </>
  ),

  design: () => (
    <>
      <P>
        On the <b>Ship design</b> screen you pick a hull, armor, an optional shield and computer, weapons and special
        systems. Everything must fit in the hull's space. Armor and the computer take no space; shields and specials
        need more space on bigger hulls. Colony ships, outpost ships and transports are fixed designs you build straight
        from the build list.
      </P>
      <Ul>
        <li>The armor grade multiplies the hull's armor and structure (<HelpLink to="page:hulls" />, <HelpLink to="page:armor" />).</li>
        <li>Each weapon mount has a count, optional modifications (heavy, point defense, autofire and so on) and, for beams, a firing arc. Missile mounts also choose how many shots their rack holds (<HelpLink to="page:weapons" />).</li>
        <li>A ship can carry at most {MAX_WEAPON_SLOTS} weapon mounts.</li>
        <li>Combat speed depends on how full the hull is: an empty hull is fast, a packed one slow. Speed gives beam defense; the computer, specials and race picks give attack.</li>
        <li>Ship cost is scaled by your government (<HelpLink to="page:governments" />).</li>
        <li>Cruisers and larger hulls can only be built at colonies with a star base, battlestation or star fortress.</li>
        <li>Mark old designs obsolete to hide them from build lists.</li>
        <li>The <b>Style</b> picker changes only how the ship looks. Every race has its own style, new designs start in yours, and any design can use any style.</li>
      </Ul>
      <h3>Refits</h3>
      <P>
        Drives and fuel range follow your best technology on every ship by themselves. Armor, shields, computers, weapons
        and specials are part of the design: to change them, refit the ship to another design of the same hull. A refit is
        planetary production like any other: open the production screen of any colony of yours in the system the ship
        orbits and press <b>Refit ships in orbit</b>; that is the only place refits are ordered.
        The colony must be able to build that hull. The refit costs{" "}
        {REFIT.costDifferenceMult} times what the new design costs more than the old one, but at least the bare hull's cost divided by {REFIT.minHullCostDivisor}, and goes into
        that colony's build queue ahead of Trade Goods and Housing, paid with its production. Until it is done the ship
        is gone from its fleet, in dock, and takes part in nothing; only when the item is finished does it come back,
        repaired and with its crew's experience. Like any item the refit can be moved around the queue; taking it out
        of the queue, or losing the colony, brings the ship back unchanged. Colony ships, outpost ships and transports can't be refitted.
      </P>
      <P>
        See <HelpLink to="page:weapons" />, <HelpLink to="page:shields" />, <HelpLink to="page:computers" />,{" "}
        <HelpLink to="page:specials" /> and <HelpLink to="page:modules" />.
      </P>
    </>
  ),

  fleets: () => (
    <>
      <h3>Movement</h3>
      <P>
        All your ships move at the speed of your best drive, in parsecs per turn, and can only fly within fuel range of
        your colonies and outposts, or those of your allies. See <HelpLink to="page:drives" />.
      </P>
      <Ul>
        <li><b>Nebulae</b> slow every ship inside them to {NEBULA_SPEED} parsec a turn (not trans-dimensional races or fleets with a Navigator), and no shields work in a battle there.</li>
        <li><b>Black holes</b> cannot be entered, and ships cannot fly within {BLACK_HOLE_RADIUS} parsecs past them unless a Navigator leads the fleet.</li>
        <li><b>Wormholes</b> link two distant stars; the trip takes one turn and needs no fuel.</li>
        <li>A <b>Star Gate</b> sends ships between any two of your colonies in one turn; a <b>Jump Gate</b> adds {JUMP_GATE_BONUS} to your speed between your colonies.</li>
        <li>An enemy <b>Warp Interdictor</b> slows your ships near its system to a crawl.</li>
        <li>Ships already in flight can only change course with communication techs: {COMM_REDIRECT_RANGE.map((c) => `${TECHS[c.tech]?.name ?? c.tech} ${Number.isFinite(c.range) ? `within ${c.range} parsecs of an orbital base` : "anywhere"}`).join(", ")}.</li>
      </Ul>
      <h3>Scanners</h3>
      <P>
        Your colonies and ships see {BASE_SCAN_RANGE} parsec around them, more with scanner techs. Orbital stations add
        to the range around their colony. Big ships are easier to spot. Ships with a stealth field or a cloak, and the
        ships of stealthy races, stay hidden unless they share a system with you. Empires meet when their scanners or
        fleets reach each other.
      </P>
      <h3>Blockades</h3>
      <P>
        An enemy warship over one of your colonies, with none of yours or your allies' to oppose it, blockades it: the
        colony's farmers and workers lose {BLOCKADE_PENALTY}% of their output, and freighters can't get through.
      </P>
      <h3>Command points</h3>
      <P>
        Every ship uses command points by hull size: {HULLS.map((h) => `${h.name.toLowerCase()} ${h.commandPoints}`).join(", ")}. You have{" "}
        {BASE_COMMAND_POINTS} to start with, more from star bases, battlestations, star fortresses, the space academy
        and communication techs; <HelpLink to="trait:warlord" /> races get {TRAIT_EFFECTS.warlordCommandPerColony} more per colony.
        Each point over the limit costs {COMMAND_OVERAGE_COST} BC a turn.
      </P>
      <h3>Stance</h3>
      <Ul>
        <li><b>Defend</b>: fights enemy ships but leaves planets alone.</li>
        <li><b>Attack</b>: also attacks enemy planets' defenses; once they are down, the turn asks what the fleet does to the colony (<HelpLink to="guide:invasion" />).</li>
      </Ul>
      <P>Fleets at the same star can be merged or split from the star panel. New ships join an idle fleet of their kind at the star where they were built.</P>
    </>
  ),

  combat: () => (
    <>
      <P>
        Battles happen when hostile armed fleets meet, or when an armed colony sees enemy ships. They are fought on a
        {" "}{FIELD_WIDTH}×{FIELD_HEIGHT} battlefield for up to {MAX_ROUNDS} rounds. Every battle you fought opens as the next turn starts, and the turn report keeps it for replay. A battle ends when one side has nothing left; if both still stand when time runs out, the
        defender holds the field (when neither side has anything left to shoot with, time runs out at once).
      </P>
      <h3>Commanding a battle</h3>
      <P>
        When you end the turn, it stops at each battle you take part in. Choose <b>Command the battle</b> to give
        orders yourself, or <b>Auto-resolve</b> to let your combat doctrine fight it (you watch the replay after the
        turn). While you command, each of your ships, stations and armed planets waits for you on its turn and takes
        as many orders as it has movement and weapons for, as in the original: click the field inside the blue ring and
        press <b>Move here</b>, or double-click (double-tap) the spot to move there at once (turning uses some of the movement), pick an enemy (orange rings: in reach of a weapon;
        grey: out of reach) and <b>Fire</b> the weapon groups that can reach it, then pick another target for the rest,
        or move on and fire later. Each weapon group shows its chance to hit, damage per hit and the damage likely to
        get through the target's shields. Its switch cycles <b>Fire</b>, <b>Standby</b> (sits out the next volley)
        and <b>Off</b> (stays off). <b>Turn to face it</b> swings the ship so a weapon's arc covers the target;
        <b> Board</b> sends marines to a ship they can reach; <b>Wait</b> lets your other units act first; <b>Done</b>
        ends the unit's turn. <b>Scan</b> shows a unit's armor, shields per facing, ratings, systems and weapons (while
        it is on, click any unit to scan it). Missiles flying at the unit are listed with when they hit, and how much
        sooner if you move where you planned. <b>Self-destruct</b> blows the ship up: its explosion damages every unit
        nearby, friend or foe. A ship can also <b>Retreat</b>, let the computer play its turn, or you can
        <b> Auto-resolve the rest</b> at any time. Turn the
        question off with <b>Let me command my battles</b> under Game (or on the Fleets screen), and every battle then
        resolves by itself.
      </P>
      <P>
        The battle screen lists your units on the left and the enemy's on the right with what each has left (on narrow
        screens <b>Forces</b> opens the lists); an enemy's tag shows your best chance to hit it, and a click on it targets
        it. The deck below shows the unit on its turn (armor, structure, shields per facing, movement left), its weapon
        groups and the target. Keys: <Key>F</Key> fire, <Key>M</Key> move, <Key>W</Key> wait, <Key>D</Key> done,
        <Key>S</Key> scan, <Key>Tab</Key> next target, <Key>Enter</Key> the obvious next step, <Key>Esc</Key> cancel.
      </P>
      <h3>Moving and firing</h3>
      <Ul>
        <li>Whoever started the fight attacks, unless the battle is at the other side's colony: a colony's owner always defends. The defender deploys on the left, the attacker {DEPLOY.rightColumn - DEPLOY.leftColumn} squares away on the right (a human attacker takes the left instead). Ships line up in a column by size, biggest in the middle; the planet sits behind the defenders with its station in front of it.</li>
        <li>Every round the attacker's ships act first, one after another, then the defender's. With the <b>Ship initiative</b> game option, every ship of both sides acts in order of combat speed plus a tenth of its beam attack instead, plus the Tactics skill of its owner's administrator in that system.</li>
        <li>Ships spend their combat speed to move and turn. Each beam fires only into its arc, so facing matters.</li>
        <li>A beam's hit chance is its attack against the target's beam defense, minus a penalty that grows with range. Damage also drops with range unless the mount ignores it.</li>
        <li>Better rolls do more damage: a shot that barely hits does its minimum, a near-certain one close to its maximum.</li>
        <li>Missiles fly {MISSILE_SPEED.base} squares a round, {MISSILE_SPEED.perDrive} more for every drive after the first; torpedoes keep their own speed. On arrival they can be shot down by point-defense beams whose firing arc faces the side they came in from, anti-missile rockets ({ANTI_MISSILE.base - Math.floor(2 * ANTI_MISSILE.perBandStep) - 1}% each) or a lightning field, or misled by jammers; point defense and rockets only bother with missiles whose damage would get through the shields. Better missiles are harder to shoot down; torpedoes cannot be shot down and do half damage to planets.</li>
        <li>Fighter and bomber bays launch craft that fly to their target and attack once a turn until their passes are spent ({CRAFT.fighters.shots} for interceptors, {CRAFT.heavyFighters.shots} for heavy fighters, {CRAFT.bombers.shots} for bombers), then return to rearm. Each pass a fighter fires one shot of your best beam that can take a point-defense mount, aimed with {CRAFT.attackBase} plus your best computer; bombers drop your best bomb, which always hits. Craft get faster with better drives and tougher with better armor.</li>
        <li>Bombs drop only on an enemy planet your fleet came to attack, from {COMBAT_BOMB_RANGE.normal} squares ({COMBAT_BOMB_RANGE.transporters} with Transporters); each volley uses one of the rack's shots.</li>
        <li>Range is measured between the nearest squares of the two ships: frigates fill one square, destroyers and cruisers 2×2, larger ships and planets 3×3.</li>
      </Ul>
      <h3>Damage</h3>
      <Ul>
        <li>Shields take their class off every hit, then soak what is left from the pool on the side that was hit. Each side recovers part of its pool every round.</li>
        <li>An Energy Absorber takes a quarter of each hit first and adds it to the ship's next shot; a Damper Field lets only a quarter of the rest through.</li>
        <li>Damage that gets through wears down armor first. Past the armor each piece of damage lands on an internal system or the structure: a system's chance grows with its hit points (the drive counts half) against the structure left. A system takes what it can hold and the rest lands again; a weapon hit breaks one weapon at a time. Losing the drive destroys the ship. Every point on structure or systems has a {DAMAGE.crewCasualty * 100}% chance to kill a marine.</li>
        <li>A ship that loses its drive explodes: {EXPLOSION.perDriveHP} times its hull's drive hit points (a cruiser {EXPLOSION.perDriveHP * HULLS_BY_ID.cruiser.driveHP}, a titan {EXPLOSION.perDriveHP * HULLS_BY_ID.titan.driveHP}), {EXPLOSION.detonatorMult} times that with a Quantum Detonator, which goes off however the ship dies. The blast hits every ship nearby, friend or foe, weaker with distance, and can set off more explosions.</li>
        <li>Armor-piercing and shield-piercing weapons skip part of this, and some specials change it further.</li>
        <li>Repair units fix armor, structure and systems every round, broken weapons included.</li>
        <li>Gyro Destabilizers and Spatial Compressors go straight into the structure. Pulsars and compressors strike every ship near the firing ship, friends too, once an enemy is within reach. A Stasis Field holds one ship until it is let go; a Black Hole Generator destroys the ship it traps at the end of the second turn after, unless it is lost first. Ion weapons cannot be aimed at raiders or monsters.</li>
      </Ul>
      <h3>Damage and repair</h3>
      <P>
        Armor and structure damage stays on a ship after the battle; the fleet panel counts the damaged ships. A ship
        that spends a turn in orbit at a system where you have a colony or outpost is repaired completely; in deep space
        or at foreign systems it stays damaged. Advanced Damage Control, a cybernetic race or an Engineer captain repair every ship fully after
        each battle, and an Automated Repair Unit does the same for its own ship.
      </P>
      <h3>Crews</h3>
      <P>
        Every ship's crew gains {CREW.xpPerTurn} experience a turn, plus the best Instructor's bonus, and more while in
        orbit at your own Space Academy; ships built there start as {CREW.names[1]}. After a won battle the surviving
        crews and captains gain half the summed hull sizes of the enemy ships destroyed. Experience stops at
        {" "}{CREW.xpCap} every turn, so crews top out at {CREW.names[3]}; warlike races rank one level higher.
      </P>
      <Ul>
        {CREW.names.map((n, i) => (
          <li key={n}>{n} ({CREW.xp[i]} XP): +{CREW.attack[i]} beam attack, +{CREW.defense[i]} beam defense, +{CREW.boarding[i]} boarding.</li>
        ))}
      </Ul>
      <h3>Combat doctrine and retreat</h3>
      <P>
        On the <b>Fleets</b> screen you set when your fleets retreat (when their strength drops below a share of the
        enemy's) and whom they target first: the nearest, weakest or strongest enemy. A retreat is an order each ship
        takes on its turn; it escapes at the start of its next turn, and until then it can still be shot or boarded. Only
        ships with a working drive that can still move get away, and none can while an enemy Warp Dissipator works.
        Ships that escape head to your nearest colony; the rest of their fleet stays to fight. If your side wins, the
        ships that escaped rejoin it.
      </P>
      <P>
        Colony ships, outpost ships and transports never fight: they wait out the battle. If your side wins they stay;
        if it loses, every ship you have left there withdraws to your nearest colony (they stay if you own another
        colony in that system). They are lost when no warship came with them, when you have no colony to withdraw to,
        or when a hyperspace flux traps them (Trans-dimensional races get away). So a warship escort always lets a
        colony ship get away from a monster.
      </P>
      <P>
        Computer empires pull out of a battle with another empire, if they hold a colony elsewhere, once one enemy volley
        would cost them more than {RETREAT.volleyRatio} times the share of their strength that their own volley costs the
        enemy. Their unarmed ships leave on their own.
      </P>
      <h3>Boarding</h3>
      <P>
        Marines board an enemy ship that cannot move (its drive is gone, a tractor beam holds it, or it is a station) from
        right beside it, whatever its shields. Transporters beam them across about {BOARDING.transporterBand * 3} squares,
        but only through a shield facing that is down and never through hard shields; a damper field stops{" "}
        {BOARDING.damperDivisor - 1} in {BOARDING.damperDivisor} of a party beamed in from afar. Half the marines aboard
        go each time. When the odds look good the party tries to take the ship, fighting the defenders as ground troops do
        (with your marines' equipment, Commando captains, Security captains and Security Stations); otherwise it raids,
        each marine who beats the defenders by more than {BOARDING.raid.sabotageAbove} wrecking two internal systems for{" "}
        {BOARDING.raid.systemDamage} damage each.
      </P>
      <P>
        A captured ship loses its captain and sits out the rest of the battle (a telepathic captor turns it on its old
        side at once). The captor keeps it only if its side wins, otherwise it is lost; a telepath's prize is kept
        whoever wins. A ship with a Quantum Detonator
        blows itself up half the time when taken.
      </P>
      <h3>Stations and planets</h3>
      <P>
        A star base, battlestation or star fortress fights as an immobile cruiser, battleship or titan with a Regular
        crew, your best armor, shield and computer, and the specials you know (Heavy Armor, Reinforced Hull, shield
        specials, your best jammer, Warp Dissipator, Battle Scanner and more, up to eight). A quarter of its space holds
        heavy mounts of your best beam, an eighth plain mounts, an eighth point-defense beams, all firing in every
        direction without running dry, and half holds {STATION_ARMS.missileRack}-shot missile racks. A battlestation
        gives every unit on your side +{SIDE_ATTACK_BY_IMMOBILE_SIZE[3]} beam attack and a star fortress +
        {SIDE_ATTACK_BY_IMMOBILE_SIZE[4]}; an armed planet with no station gives +{SIDE_ATTACK_BY_IMMOBILE_SIZE[3]} too.
        If the station is destroyed or captured, the building is lost.
      </P>
      <P>
        The planet itself is a separate target with its own ground batteries, missile base, stellar converter and fighter
        garrison (which sends up fresh craft every {FIGHTER_GARRISON.replenishRounds} combat turns), crewed by Regulars and
        aimed with a Battle Scanner once you know it. Every hit on it loses the planetary shield's strength
        (<HelpLink to="page:buildings" />) plus your best ship shield class. Ship beams do only half damage to it. Every
        {" "}{PLANET_INSTALLATION_HP} damage that gets through (more with better armor) knocks out one installation at random. Once they are all gone,
        damage past the planetary shield alone falls on the colony: every {PLANET_POPULATION_HP} is one bombing hit. Stations are fair game in any
        battle, but only fleets set to attack fire on the planet, and only once no defending ships or station remain.
        After a won battle such a fleet bombards the colony with every weapon for {BOMBARD_ROUNDS} combat turns.
      </P>
    </>
  ),

  invasion: () => (
    <>
      <P>
        A colony is open to attack when its orbital defenses are silenced in battle, or it has none, and no armed enemy
        ships remain at the star.
      </P>
      <h3>Orbital assault</h3>
      <P>
        When your fleets on <b>Attack</b> stance hold the orbit of an open enemy colony after the battles, the turn stops
        and asks what they do to it, showing the colony's defenders and the expected losses of each choice:
      </P>
      <ul>
        <li><b>Bombard</b>: every weapon aboard fires at the planet for {BOMBARD_ROUNDS} combat turns (beams at half
          damage, missiles and bombs until their shots run out). Each shot loses the planetary shield's worth of damage,
          and every {BOMB_DAMAGE_PER_HIT} points that get through are one hit. A hit lands at random on a building (not the
          colony's defenses), a trained marine or tank, or a colonist; a tank needs at least two hits.</li>
        <li><b>Bombard with biological weapons</b>: as above, and every launch of death spores or the bio-terminator kills a
          colonist with a {pct(SPORE_KILL_CHANCE_PER_POINT)} chance per point of damage (halved by Microbiotics, quartered by
          Universal Antidote; a Planetary Barrier Shield keeps them out). Every computer empire in contact that is not at
          war with you is appalled: relations fall by 1 to {RELATION_EVENTS.destruction} before their own scaling.</li>
        <li><b>Destroy the planet</b>, with a Stellar Converter aboard any ship in orbit: the planet becomes an asteroid
          belt and the colony, its people, buildings and the planet's special are gone. It appals the other empires the
          same way. In battle the converter only wears down a planet's defenses; it destroys a planet only from orbit.</li>
        <li><b>Hold fire</b>: leave the colony be this turn.</li>
      </ul>
      <P>
        A colony bombed to zero is destroyed. Without an answer (when the game plays your turns, or for fleets of computer
        players that give no order) fleets on Attack bombard without biological weapons. Computer players spare a colony
        they mean to invade once their troops outnumber its garrison, and destroy a planet they cannot take when it hides
        behind a barrier shield or is its owner's last system.
      </P>
      <h3>Defenders</h3>
      <P>
        Every colony has one militia unit per {fmt(1 / MILITIA_PER_POP)} population, rounded down. A Marine Barracks and an Armor
        Barracks field marines and tanks when built and train more over time, up to a cap that grows with the planet.
      </P>
      <h3>Invasion</h3>
      <P>
        Select a fleet carrying troops (transports, troop pods or assault shuttles) at the star and press <b>Invade</b>.
        The troops land when the defenses are down and fight the defenders one duel at a time until one side is gone:
        first the tanks, then the marines, then the militia. The lower roll takes a hit, and a tie wounds both.
      </P>
      <P>
        Militia fight at {TROOPS.militia.rating}, marines at {TROOPS.marines.rating}, armor at {TROOPS.armor.rating} with{" "}
        {TROOPS.armor.hits} hits, all plus {BASE_EQUIPMENT} for basic armor. The best armor and the best hand weapon you
        know add their bonus, and a personal shield and an anti-grav harness add theirs. Powered Armor gives marines and
        Battleoids give tanks +{SPECIAL_UNIT_RATING} and one more hit. Computer players fight a little better on harder
        levels. Each racial ground combat pick is worth ±
        {PICK_VALUES.groundCombatPerLevel}. <HelpLink to="trait:lowG" /> troops fight at −10,{" "}
        <HelpLink to="trait:subterranean" /> defenders at +10, <HelpLink to="trait:highG" /> troops take one more hit,
        and Commando leaders add their skill: the system's colony leader for the defenders, and the best ship officer at
        the star for troops landing from orbit, at {COMMANDO_INVASION.perLevel} per level ({COMMANDO_INVASION.improvedPerLevel / COMMANDO_INVASION.improvedDivisor} improved). A captured colony keeps its people, who
        must be assimilated (see Colonies). Its {CAPTURE_LOSSES.buildings.map((b) => BUILDINGS_BY_ID[b]?.name ?? b).join(", ")} are
        torn down, and its build queue and every trained marine and tank are lost; stations, missile bases, ground
        batteries, shields, fighter garrisons and all other buildings pass to you. A Unification captor also tears down
        the {CAPTURE_LOSSES.unificationRefunds.map((b) => BUILDINGS_BY_ID[b]?.name ?? b).join(" and ")} for{" "}
        {CAPTURE_LOSSES.refundShare * 100}% of their cost. The surviving invaders re-board full troop ships
        ({MARINES_PER_TRANSPORT} marines each) keeping at least one marine on the planet; ships they can't fill are
        dismantled and the rest stay as its garrison, up to half the planet size's population base (warlords the whole). It may also yield up to {CAPTURE_TECH.maxTechs} of the loser's techs: each
        building whose tech you lack gives it with a {CAPTURE_TECH.perBuilding.human / 10}% chance, then each colonist one
        of the loser's techs with a {CAPTURE_TECH.perColonist.human / 10}% chance, both divided by one more than the techs
        taken so far (computer players' odds are a little lower, rising with the difficulty level).

      </P>
      <P>
        <HelpLink to="trait:telepathic" /> empires can take a colony whose orbit they won by mind control instead: pick
        Mind control in the orbit window (or Mind control in the system panel). It needs a cruiser or larger warship in
        orbit, works through a barrier shield and turns the colony over whole, every colonist assimilated at once and
        no ground battle fought. The same buildings are torn down as in an invasion, and the colony starts without
        a garrison. Rebels who win a revolt keep up to {REBEL_GARRISON_MAX} of their own as marines. It fails when the owner's race is telepathic too, or when the owner has a Telepath
        officer in that system (a captain there or its administrator). Conquerors outside democracies and federations may
        exterminate a conquered population, which every other empire resents.
      </P>
    </>
  ),

  diplomacy: () => (
    <>
      <P>
        Once you meet an empire you can request an audience with its ruler on the <b>Diplomacy</b> screen and trade
        proposals face to face; computer rulers answer on the spot. They also ask for an audience themselves when you
        first meet, when they declare war and when they bring a proposal or demand. Proposals expire after{" "}
        {PROPOSAL_LIFETIME} turns.
      </P>
      <Ul>
        <li><b>War</b>: your ships and theirs fight on sight. Relations fall to {RELATION_EVENTS.declareWar.set} minus a d{RELATION_EVENTS.declareWar.roll} and stay at {RELATION.warCeiling} or below. Declaring war on someone you had a treaty with costs their trust and your reputation with everyone, and their computer allies may join in over the next turns.</li>
        <li><b>Peace</b>: ends a war. Relations rise by {RELATION_EVENTS.peace.gain} but no higher than {RELATION_EVENTS.peace.max}, and neither side may declare war for {PEACE_TREATY_TURNS} turns; then the treaty lapses.</li>
        <li><b>Non-aggression pact</b>: a promise not to attack; each turn relations may rise by 1 to {TREATY_WARMTH.nonAggression}. Not while at war.</li>
        <li><b>Alliance</b>: allies share fuel range, relations rise by 1 to {TREATY_WARMTH.alliance} every turn, and computer allies join each other's wars. Only from a non-aggression pact, and only with an empire whose relation with you is at least {TREATY_ANSWER.allianceMinAttitude}.</li>
        <li><b>Trade treaty</b>: each side earns BC equal to half the smaller partner's population, times its government's BC rate.</li>
        <li><b>Research treaty</b>: each side gains research equal to half the smaller partner's population, times its government's research rate.</li>
        <li><b>Technology exchange</b>, <b>gifts</b> of BC, techs or systems, and a standing <b>tribute</b> of 5% or 10% of your income.</li>
        <li><b>Demands</b>: tribute, a tech, a system, war on or peace with a third empire, breaking an alliance, recalling spies or fleets. A computer ruler rolls a d200 plus how your fleets, size and technology compare to its own, plus its patience and temperament, minus what the demand costs it: high, it gives in; lower, it refuses, warns you, ends your treaties or declares war.</li>
        <li>
          <b>Surrender</b>: hand your whole empire to another ruler: its colonies, ships, the technologies they can use, your treasury
          and freighters; all your spies join theirs at home (up to {SURRENDER.spyCap}), and your leaders leave. Computer rulers do it
          too, rarely: from turn {AI_SURRENDER.minTurn}, when a war with another computer empire has dragged on past the point where
          they would make peace, one that is small (under {AI_SURRENDER.weakPct}% of the largest empire's population, or its fleet
          under that share) or has lost much of its people may give up instead. It joins the most populous computer empire it
          knows and is not at war with; on Tutor, Easy and Average, failing that, the most populous empire it knows, which can be you.
          Every surrender and every empire destroyed makes the front page of the Galactic News.
        </li>
      </Ul>
      <P>
        A new treaty starts at minus half the smaller population and climbs by 1/{TREATY_YIELD.rampSteps} of its full value each
        turn, so it runs at a loss for about {TREATY_YIELD.rampSteps} turns and reaches full value after about {2 * TREATY_YIELD.rampSteps}; a
        research treaty's setup is paid in BC. Pirates halve trade. <HelpLink to="trait:fantasticTraders" /> earn {TREATY_YIELD.traderPoints}% more from trade treaties; <HelpLink to="trait:repulsive" /> races

        can only make peace or war.
      </P>
      <h3>Computer rulers' personalities</h3>
      <P>
        Like in the original, every computer ruler gets a temperament, an objective and a ship doctrine at the start,
        fixed for the game. The temperament is rolled on its race's own row of ten: a d{TEMPERAMENT_ROLL.die} +{" "}
        {TEMPERAMENT_ROLL.shift} minus the difficulty (tutor 0 to impossible 4), so harder games roll the hostile end.
        Each race can be: {RACES.map((r) => `${r.plural} ${[...new Set((TEMPERAMENT_ROWS[r.assetKey] ?? TEMPERAMENT_ROWS.default!).map((x) => TEMPERAMENTS[TEMPERAMENT_ORDER[x]!].name))].join("/")}`).join("; ")}.
        The objective, weapon lean and ship specialty are drawn by weights that the race's picks raise (creative races
        lean hard toward Technologist, +50 ship attack toward Militarist and beams, cybernetic races toward armor).
        The Diplomacy screen shows each ruler's objective and doctrine; hover them for what they do.
      </P>
      <Ul>
        {Object.values(OBJECTIVES).map((o) => <li key={o.name}><b>{o.name}</b>: {o.text} Researches {Object.keys(o.research).map((g) => RESEARCH_GROUP_NAMES[g as ResearchGroup]).join(", ")} early.</li>)}
        {Object.values(WEAPON_LEANS).map((w) => <li key={w.name}><b>{w.name}</b>: {w.text} Researches {Object.keys(w.research).map((g) => RESEARCH_GROUP_NAMES[g as ResearchGroup]).join(", ")} early.</li>)}
        {Object.values(SHIP_SPECIALTIES).map((sp) => <li key={sp.name}><b>{sp.name} specialty</b>: {sp.text} Fits {sp.specials.map((id) => SPECIALS_BY_ID[id]?.name ?? id).join(", ")} first.</li>)}
      </Ul>
      <h3>How computer rulers answer</h3>
      <P>
        A computer ruler accepts a treaty when its relation with you, plus a d100, minus what the treaty asks of it
        ({TREATY_ANSWER.need.nonAggression} for a non-aggression pact, {TREATY_ANSWER.need.alliance} for an alliance,{" "}
        {TREATY_ANSWER.need.trade} for trade, {TREATY_ANSWER.need.research} for research), plus its temperament and
        your diplomatic bonuses, comes to 0 or more. Temperaments: {Object.values(TEMPERAMENTS).map((t) => `${t.name} ${t.treaty >= 0 ? "+" : ""}${t.treaty}`).join(", ")}.
        Charismatic proposers get +{TRAIT_EFFECTS.charismaticDiplomacy}, telepathic +{TRAIT_EFFECTS.telepathicDiplomacy};
        Xeno Psychology and diplomat leaders add more. Their trust in you and your reputation count too: breaking a
        treaty costs the victim's trust and some of your reputation with everyone you know, for good. When the sum
        falls between {TREATY_ANSWER.bigPrice} and 0, a ruler asked for a non-aggression pact, an alliance or peace may
        name a price instead of refusing: BC, a technology, a tribute or, for a big price, a star system. Pay it and the
        treaty is signed.
      </P>
      <P>
        Peace comes only after {TREATY_ANSWER.peaceMinWarTurns} turns of war, and relations do not count: the longer the
        war, the more other wars they fight, the stronger you are, the more ships they have lost and the more of their
        systems your ships hold, the likelier they agree. Their strength counts half for every other war they fight; their
        ships in your systems make them bolder. Computer rulers also offer peace themselves once a war has run {AI_PEACE.minTurns} turns:
        when they are winning they ask a price for it, when they are losing badly they offer you one (BC, a technology, a
        tribute or one of their systems), which you get if you accept. A computer ruler that has fought an enemy of yours for
        {" "}{PAID_WAR.minWarTurns} turns and is losing ships to it may also offer you BC or a technology to declare war on that enemy.
      </P>
      <P>
        Every proposal wears down their patience: {PATIENCE.perAsk} points, and {PATIENCE.firstAsk} to{" "}
        {PATIENCE.firstAsk + PATIENCE.firstAskRoll} more for the first in a turn, all of it counted against their next
        answers. Asking for the same kind of thing again and again, or making demands, soon has them refuse to see you.
        Patience comes back by {PATIENCE.recovery} a turn; breaking a treaty exhausts it.
      </P>
      <h3>Relations</h3>
      <P>
        Every pair of empires shares one relation, from -100 to 100. It starts where the two races' history puts it and
        drifts back toward that level: on a quiet turn, with chance ({RELATION.driftDie} minus how far it is from 0) /{" "}
        {RELATION.driftDie} × 1/{2 * RELATION.driftOneIn}, it moves one step. Treaties warm it a little every turn; without an alliance it
        stops at {RELATION.capWithoutAlliance}. Events move it at once: a technology exchange +{RELATION_EVENTS.techExchange}, agreeing
        to a computer ruler's request +{RELATION_EVENTS.agreedToRequest[0]} to +{RELATION_EVENTS.agreedToRequest[1]}, gifts, council
        votes, caught spies, armed fleets near their colonies, and wiping out a population (-d{RELATION_EVENTS.destruction} with every
        computer empire). Gains count double while relations are below 0 and less and less the better they get; losses
        count double while they are good. Honorable rulers take offence twice as hard. Good turns done by a{" "}
        <HelpLink to="trait:charismatic" /> race count double and bad ones half. On Hard and Impossible, computer
        empires you have no treaty with grow jealous of your treaties with others.
      </P>
      <P>
        A computer ruler you hurt (spying, threats, refused demands) may count strikes against you: the first is a
        warning, a second ends your treaties or asks for compensation, and a third means war when its fleets can stand
        up to yours. Before that war, a ruler that is not Honorable may demand one of your systems it covets instead (from
        Average difficulty, a system within its fleets' reach with at least {COVET.minValue / COVET.perPop} population, never your
        capital's): hand it over, or refuse or ignore the demand and it declares war. Computer rulers also make treaties and wars among themselves. Charisma (+{TRAIT_EFFECTS.charismaticDiplomacy}), telepathy (+{TRAIT_EFFECTS.telepathicDiplomacy}),
        Xeno Psychology and Diplomat leaders add diplomatic points to every deal an empire offers.
      </P>
    </>
  ),

  espionage: () => (
    <>
      <P>
        Spies are trained as a colony project. On the <b>Espionage</b> screen keep them home as defenders or send them to
        another empire to steal technology or sabotage buildings and population.
      </P>
      <P>
        Each turn your spies in an empire make one roll together: 1–100 plus your spying, plus 2 per spy (up to 5, then
        1 each up to 10, then half), minus their 1–100, their security and the same bonus for the spies they keep home.
        {SUCCESS_THRESHOLD} or more steals a technology (pricier fields are likelier), {SPY.sabotage} or more destroys a
        building, and {SPY.blame} or more makes them blame a third empire. A second roll decides whether one of your
        spies is caught or one of theirs dies; spies told only to hide are safer. Missions that work hurt relations.
      </P>
      <P>
        Spying comes from race picks ({PICK_VALUES.spyingPerLevel} per level), techs and Spy Master leaders; security from the same race picks and
        techs, government, security buildings and Telepath leaders. <HelpLink to="trait:telepathic" /> races add
        {TRAIT_EFFECTS.telepathicSpy} to both. Assassin leaders kill enemy spies before they act.
      </P>
    </>
  ),

  leaders: () => (
    <>
      <P>
        {HEROES.length} legendary leaders roam the galaxy. From turn {LEADER_RULES.firstOfferTurn} one may offer their
        services on the <b>Leaders</b> screen; the longer since the last offer the likelier the next, and the more leaders
        you already have the rarer. Stronger leaders appear as the game goes on, sooner in games with more empires. An offer you don't take stays open for
        {" "}{LEADER_RULES.queueTurns} turns. You can employ up to {MAX_LEADERS}, at most {LEADER_RULES.maxPerKind} of each kind.
      </P>
      <P>
        A leader who offers their services introduces themself as the next turn starts: who they are, what each skill does
        at their level, their price and upkeep and, for a colony leader, the system where they would do the most. Hire them
        there, or leave the offer waiting on the Leaders screen until it runs out. With leaders automated, the offers are
        handled for you.
      </P>
      <P>
        <b>Colony leaders</b> govern a star system; <b>ship officers</b> command a fleet. Common skills help the whole empire
        wherever the leader is. Reaching a post in another system takes {LEADER_RULES.travelTurns} turns.
      </P>
      <P>
        Leaders gain {LEADER_RULES.xpPerTurn} experience a turn, more in battle and with an Instructor. Levels come at{" "}
        {LEVEL_XP.slice(1).join(", ")} experience (the last only for <HelpLink to="trait:warlord" /> races). The price is
        the leader's skill weights (and the techs they bring) × level × {LEADER_RULES.costPerWeightLevel} BC; upkeep is a
        hundredth of that, at least 1 BC a turn. <HelpLink to="trait:charismatic" /> races pay half and are offered more
        and better leaders; <HelpLink to="trait:repulsive" /> races pay half again as much and see fewer.
      </P>
      {(["common", "colony", "ship"] as HeroSkillGroup[]).map((g) => (
        <div key={g}>
          <h3>{g === "common" ? "Common skills" : g === "colony" ? "Colony leader skills" : "Ship officer skills"}</h3>
          <Ul>
            {(Object.keys(HERO_SKILLS) as HeroSkill[]).filter((s) => HERO_SKILLS[s].group === g).map((s) => (
              <li key={s}>
                <b>{HERO_SKILLS[s].name}</b>: {HERO_SKILLS[s].text.replace("{v}", `${abilityValue({ skill: s, improved: false }, 1)}`)}
                {" "}(per level; improved: {abilityValue({ skill: s, improved: true }, 1)}).
              </li>
            ))}
          </Ul>
        </div>
      ))}
      <P>
        In battle the best ship officer on each side counts for each combat skill, and helps every ship, station and planet
        of that side, as long as the officer's own fleet still has a ship in the fight.
      </P>
      <P>Only one leader can hold each post. A leader whose post is lost waits at home for a new one.</P>
    </>
  ),

  council: () => (
    <>
      <P>
        If the council is enabled, it first convenes once {pct(COUNCIL.settledShare)} of the galaxy's systems are
        owned (not before turn {COUNCIL_FIRST}, and only while at least {COUNCIL.minEmpires} empires live), then every{" "}
        {COUNCIL_INTERVAL} turns while at least {COUNCIL.minEmpires} empires remain. The two most populous empires stand
        as candidates and every empire gets one vote per {COUNCIL.popPerVote} population, rounded up (no population, no
        vote).
      </P>
      <P>
        A candidate with {pct(COUNCIL_MAJORITY)} of all votes is elected. A session plays out as a turn starts, as in the
        original: every empire's delegation declares in seat order, computer candidates for themselves, and the running count is shown
        against the two thirds needed. When your seat comes up you back a candidate or abstain, even when you stand yourself. Your votes are never cast for you: the
        turn does not end until you have declared, and the Diplomacy screen takes you back into the chamber. The council counts the votes when the turn ends.
      </P>
      <h3>How computer empires vote</h3>
      <P>
        A computer empire backs a candidate when a d{COUNCIL_VOTE.die} rolls at or under its relation with that candidate,
        plus its trust, plus twice the candidate's reputation, plus these points: +{COUNCIL_VOTE.atWarWithRival} if it is at
        war with the other candidate, +{COUNCIL_VOTE.sameAsLastTime} if it backed this candidate last time, +
        {COUNCIL_VOTE.nonAggression} for a non-aggression pact, +{COUNCIL_VOTE.trade} for a trade and +{COUNCIL_VOTE.research}{" "}
        for a research treaty, +{COUNCIL_VOTE.holdsOrion} if the candidate holds Orion, +{COUNCIL_VOTE.xenoPsychology} if it
        knows Xeno Psychology, +{COUNCIL_VOTE.charismatic} for a <HelpLink to="trait:charismatic" /> and{" "}
        {COUNCIL_VOTE.repulsive} for a <HelpLink to="trait:repulsive" /> candidate. It always backs an ally and never one it
        is at war with. It rolls for both candidates and votes only when exactly one roll succeeds; otherwise it abstains.
        Against a human candidate it also counts its temperament's mood toward humans ({COUNCIL_VOTE.mood} points a step),
        and on Hard and Impossible a human candidate's total shrinks.
      </P>
      <P>
        Every vote moves relations at once: +{RELATION_EVENTS.councilFor} with the candidate backed,{" "}
        {RELATION_EVENTS.councilAgainst} with the other, and {RELATION_EVENTS.councilAbstain} with both for abstaining.
      </P>
      <h3>Refusing the result</h3>
      <P>
        You may refuse another ruler's election on the next turn: if the winner is a computer empire, every other
        computer empire joins it and the united empire goes to war with you; if it is a human, you are at war with every
        empire that accepted it.
      </P>
    </>
  ),

  events: () => {
    const N = EVENT_NUMBERS;
    return (
      <>
        <P>
          Random events start on turn {EVENT_START}. Every quiet turn makes the next one likelier (about one in{" "}
          {EVENT_TIMING.dieSides} more per turn, a little less on easier levels), and after an event the galaxy stays calm
          for {EVENT_TIMING.cooldown} turns. Each time, up to {EVENT_TIMING.tries} kinds of event are drawn, all equally likely,
          and the first that can happen strikes. Each kind happens at most once a game. Disasters strike the most populous
          empires, never the smallest; windfalls go to the smaller ones. Comets don't come before turn {EVENTS.comet.fromTurn} and supernovas not before turn {EVENTS.supernova.fromTurn}, and
          a comet only during hyperspace flux. On Tutor there are no disasters. Random events can be switched off when
          starting a game. <HelpLink to="trait:lucky" /> races are spared the disasters and build up to windfalls of their own.
        </P>
        <P>
          You can't miss them: the events of a turn open as Galactic News when the next turn starts, each with a button to
          its system; those still in play stay pinned to the top left of the galaxy map with what they do and when they
          end; and the stars where they happen flash. Fleets held by hyperspace flux say so, and any order an event blocks
          tells you why.
        </P>
        <Ul>
          <li><b>Windfalls</b>: a donation of {N.donation.base} BC plus {N.donation.step} for every {N.donation.perTurns} turns played; a derelict ship that teaches the beam weapon closest above the strongest any empire has and the best armor any empire has; a breakthrough that completes your current research at once; new mineral deposits ({N.depositSteps} steps richer); a planet's axis shifting to a terran climate; a population boom (+{GROWTH.boomPercent}% growth); a diplomatic marriage (a +{N.relationShift} relation event with an empire you know).</li>
          <li><b>Disasters</b>: an earthquake ((d3 + d2) × (buildings + population) / 10 hits on buildings and colonists); an industrial accident ((d3 + d3) × population / 10 colonists die, plus one hit; tolerant races are spared); depletion (an ultra rich world drops to rich); a computer virus ({N.virus.base} + d{N.virus.die} stored research lost); a ship explosion; an assassination (a −{N.relationShift} relation event); a pirate raid ({N.pirateLootPercent.base + 1} to {N.pirateLootPercent.base + N.pirateLootPercent.die}% of the treasury).</li>
          <li><b>Threats you can fight</b>: a comet ((d{N.cometHp.die} + {N.cometHp.base} + difficulty) × {N.cometHp.mult} hit points, striking in d{N.cometTurns.die} + {N.cometTurns.base} − difficulty turns for (d3 + d3) × (buildings + population) / 10 hits), which every ship in orbit, of any empire, wears down by its hull size (frigate 1 … doom star 6) each turn. Pirates (only against an empire with {N.pirates.minFreighters} or more freighters) take freighters from every empire with a colony in their system and halve its trade, until ships in orbit wear their base down the same way. A plague (−{-GROWTH.plaguePercent}% growth) lasts until the colony's research finds a cure: its research times (d{N.plague.die} + {N.plague.perDifficulty} × difficulty). A supernova threatens a colonised star: unless the system's research adds up to its research when the threat began times the turns given, its colonies die and its worlds turn radiated.</li>
          <li><b>Hyperspace trouble</b>: flux that stops all ships, a beast that destroys a ship in flight every turn (a new victim each time), unstable wormholes that carry a fleet to its destination at once, and time-space anomalies that freeze a system: its colonies make, pay and grow nothing and nobody can fight there. Flux, the beast, anomalies and population booms end with a 1 in {N.lasting.endDie} chance each turn from their {N.lasting.minTurns}th turn on, and always by their {N.lasting.maxTurns}nd. A warp funnel can be drawn but does nothing, as in the original.</li>
          <li><b>Monsters</b> from beyond the rim: one turns a system toxic, one kills every colonist, one blockades, one ravages the population, and one demands BC or pillages the system.</li>
        </Ul>
      </>
    );
  },

  victory: () => (
    <>
      <Ul>
        <li><b>Conquest</b>: be the last empire standing. An empire is out when it has no populated colonies left; outposts and colony ships don't keep it alive.</li>
        <li><b>Council</b>: be elected by the <HelpLink to="guide:council">galactic council</HelpLink>.</li>
        <li><b>Raiders</b>: build a Dimensional Portal and send a fleet from that system to destroy the raiders' home fleet and citadel. Every other empire then capitulates (<HelpLink to="page:monsters" />).</li>
        <li><b>Score</b>: only in games started with a turn limit (off by default; the original has none): when it is reached, the highest score wins. See the score below.</li>
      </Ul>
      <P>
        Monsters, raiders, random events and the council can each be switched off when starting a game, and difficulty
        changes only what the computer empires get (<HelpLink to="guide:setup" />).
      </P>
      <P>
        <b>Score</b> follows the original. It is shown on the Empire screen during play, broken down when the game ends, and
        your best final scores go to the Hall of Fame:
      </P>
      <Ul>
        <li>−{SCORE.perTurn} for every turn played: the quicker you win, the better.</li>
        <li>{SCORE.perRace.base} for every empire that started the game, plus {SCORE.perRace.perSize} for each galaxy size above small. An empire with no population left gets neither this nor the turn penalty.</li>
        <li>{SCORE.perField} for each researched field, and {SCORE.perHyperCategory} for each category with a hyper-advanced level.</li>
        <li>{SCORE.perPop} for each population unit, androids and conquered people included.</li>
        <li>{SCORE.capturedPremium} for each unit taken by invasion, divided by the galaxy size (small 1, medium 2, large 3, huge 4).</li>
        <li>{SCORE.perEliminated} for each empire eliminated; the credit goes to the last empire that attacked one of its colonies.</li>
        <li>{SCORE.orion} for slaying the guardian of Orion, {SCORE.council} for a council victory, {SCORE.antares} for destroying the raiders at home.</li>
        <li>The sum is multiplied by the race pick bonus: 100%, plus {SCORE.perUnspentPick}% for each race pick a custom race left unspent (200% with none spent). Difficulty does not change the score.</li>
      </Ul>
    </>
  ),

  automation: () => (
    <>
      <P>
        Any part of running your empire can be handed to the same advisors the computer empires use, on the{" "}
        <b>Empire &amp; automation</b> screen. Automated areas are played for you when you end the turn, and you can
        still step in at any time.
      </P>
      <Ul>
        {ALL_DOMAINS.map((d) => (
          <li key={d}>
            <b>{DOMAIN_INFO[d].name}</b>: {DOMAIN_INFO[d].description}{" "}
            Strategies: {STRATEGIES[d].map((s) => s.name).join(", ")}.
          </li>
        ))}
      </Ul>
      <P>
        Every area follows a strategy you pick next to its switch. <b>Balanced</b> is the default and plays exactly like the
        computer empires; the others lean one way, for example a Research jobs strategy that makes most colonists
        scientists, or a Defensive military that never goes on the attack. The <b>All balanced</b> button resets them all.
        Your automation choices are remembered in this browser, and every new game starts with them.
      </P>
      <P>With everything automated you can watch the game play itself, or start a new game as a spectator.</P>
    </>
  ),
};

