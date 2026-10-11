import type { ReactNode } from "react";
import { ALL_DOMAINS, DOMAIN_INFO, STRATEGIES } from "@starlord/ai";
import {
  ANDROIDS, ASSIMILATION, PATIENCE, TEMPERAMENTS, TREATY_ANSWER, BUY_PRICE_PER_POINT, GROWTH, SPECIAL_INCOME, BASE_COMMAND_POINTS, BASE_SCAN_RANGE, BLOCKADE_PENALTY, BOMB_DAMAGE_PER_HIT,
  CAPTURE_TECH_CHANCE, COMMAND_OVERAGE_COST, SPY, COUNCIL, COUNCIL_FIRST,
  BOARDING, DEPLOY, EXPLOSION, HULLS_BY_ID, RETREAT, SIDE_ATTACK_BY_IMMOBILE_SIZE, STATION_ARMS,
  COUNCIL_INTERVAL, COUNCIL_MAJORITY, CREW, EVENT_START, FIGHTER_GARRISON, EVENT_TIMING, FIELD_HEIGHT, FIELD_WIDTH, FREIGHTERS, HERO_SKILLS, HEROES,
  JUMP_GATE_BONUS, LEADER_RULES, LEVEL_XP, MAX_LEADERS, MAX_QUEUE, MAX_ROUNDS, MILITIA_PER_POP, BASE_EQUIPMENT, SPECIAL_UNIT_RATING,
  MISSILE_SPEED, NEBULA_SPEED, PEACE_TREATY_TURNS, PICK_VALUES, PLANET_INSTALLATION_HP, PROJECT_COSTS, PROPOSAL_LIFETIME, RESEARCH,
  SPORE_KILL_CHANCE_PER_POINT, STAR_COUNTS, mapSize, SUCCESS_THRESHOLD, TAX_BC_PER_INDUSTRY, TAX_PER_POP, TAX_STEPS,
  TRADE_GOODS_RATE, TRAIT_EFFECTS, TREATY_YIELD, TROOPS, abilityValue, type HeroSkill, type HeroSkillGroup,
} from "@starlord/sim";
import { fmt, pct } from "../ui/format";
import type { GuideSlug } from "./entries";
import { HelpLink } from "./HelpDialog";

/**
 * Hand-written rules explanations. Numbers come from the rules modules so the
 * text follows the game when it is rebalanced.
 */

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
      <Ul>
        <li>Send your scouts to nearby stars from the <b>Galaxy</b> map: click the fleet, then click a star.</li>
        <li>Pick a technology on the <b>Research</b> screen. The <HelpLink to="page:techTree" /> shows everything ahead.</li>
        <li>Queue buildings or a colony ship on the <b>Colonies</b> screen and balance farmers, workers and scientists.</li>
        <li>Send your colony ship to a good planet and press <b>Colonize</b> in the star panel.</li>
        <li>End the turn with the button at the top right or <Key>Ctrl</Key>+<Key>Enter</Key>.</li>
      </Ul>
      <P>
        Anything you'd rather not micromanage can be handed to the advisors on the <b>Empire &amp; automation</b> screen
        (see <HelpLink to="guide:automation" />).
      </P>
      <h3>Using this encyclopedia</h3>
      <P>
        Every table here is generated from the game's own rules data, so the numbers are always the ones the game uses.
        Search from the box on the left, follow links between pages, and use ← → (or <Key>Alt</Key>+arrows) to go back
        and forth. <Key>F1</Key> opens and closes it from anywhere.
      </P>
    </>
  ),

  controls: () => (
    <>
      <h3>Galaxy map</h3>
      <Ul>
        <li>Drag to pan, mouse wheel to zoom.</li>
        <li>Click a star to see its planets and fleets in the side panel.</li>
        <li>Click one of your fleets, then click any star to send it there. Stars in fuel range are highlighted and the route is previewed.</li>
        <li><Key>Esc</Key> or a click on empty space deselects the fleet.</li>
        <li>Shift-click fleets to select several; they all take the next star order.</li>
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
        <li>Save and load from the <b>Game</b> screen. The title screen continues your latest save.</li>
      </Ul>
    </>
  ),

  turn: () => (
    <>
      <P>When everyone has ended their turn, the galaxy moves in this order:</P>
      <ol className="help-ul">
        <li>Everyone's orders are carried out; who goes first rotates each turn.</li>
        <li>Raiders may strike.</li>
        <li>Fleets move.</li>
        <li>Space battles are fought wherever hostile fleets or armed planets meet (<HelpLink to="guide:combat" />).</li>
        <li>Bombing and invasions of colonies whose defenses are down (<HelpLink to="guide:invasion" />).</li>
        <li>Colonies produce food, industry, research and BC; queues advance, populations grow, research completes.</li>
        <li>Spies act, diplomatic attitudes drift, leaders offer their services, the council may vote.</li>
        <li>Random events, then empires with no colonies or colony ships left are eliminated.</li>
      </ol>
    </>
  ),

  colonies: () => (
    <>
      <h3>Jobs</h3>
      <P>
        Every unit of population works as a farmer, worker or scientist. Farmers grow food according to the planet's
        climate, workers make industry according to its minerals, and scientists make research (3 points each before
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
        Trade Goods first, production becomes BC at {pct(TRADE_GOODS_RATE)}. Housing turns production into population
        growth instead. <b>Buy</b> completes the first item for BC: each missing point costs {BUY_PRICE_PER_POINT[0]} BC in the
        item's last half, {BUY_PRICE_PER_POINT[1]} BC from 10% to half done and {BUY_PRICE_PER_POINT[2]} BC below 10%,
        so buying from scratch costs about four times the item. Upgrading a station or planetary shield costs only the
        difference to the one it replaces.
      </P>
      <P>See <HelpLink to="page:buildings" /> and <HelpLink to="page:projects" />.</P>
      <h3>Growth</h3>
      <P>
        Population grows fastest when a colony is half full and stops at its maximum. Each 1,000k of growth adds one
        population unit; new colonists farm if the colony is short of food, otherwise they work.
      </P>
      <h3>Morale</h3>
      <P>
        Every 10% of morale adds or removes 10% of a colony's food, industry, research and population taxes. It comes
        from the government, buildings, techs and administrators. Feudal and dictatorial empires and their advanced forms
        lose 20% on colonies without a Marine or Armor Barracks. A colony where natives live among settlers loses{" "}
        {ASSIMILATION.multiRacePenalty}% unless it has an Alien Management Center. Losing the Capitol costs morale on every
        colony until it is rebuilt: 50% under feudal rule and confederation, 35% under dictatorship, imperium and
        federation, 20% under democracy. Unified governments have no morale at all, good or bad. Androids ignore morale.
      </P>
      <h3>Conquered people</h3>
      <P>
        People on a captured colony are aliens at first and work at half their normal rate. They join your empire one
        unit at a time: every 8 turns under feudal rule or dictatorship, 4 under democracy, confederation or imperium,
        2 under federation, 20 under unification and 15 under galactic unification. An Alien Management Center makes it
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
      <h3>Outposts</h3>
      <P>
        Outposts hold no population and produce nothing, but they claim the planet, extend your fuel range and count
        for score. Asteroids and gas giants can't be settled at all until an{" "}
        <HelpLink to="project:artificialPlanet" /> turns them into barren planets.
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
        <li>Freighters cost {fmt(FREIGHTERS.upkeepInUse, 1)} BC each for every turn they are carrying something; idle ones are free.</li>
        <li>Hired leaders draw a salary (<HelpLink to="guide:leaders" />).</li>
        <li>Every command point your ships use over your limit costs {COMMAND_OVERAGE_COST} BC a turn (<HelpLink to="guide:fleets" />).</li>
      </Ul>
      <P>
        If the treasury goes below zero, buildings are sold off, highest upkeep first, for a quarter of their cost until
        the books balance.
      </P>
      <h3>Food and freighters</h3>
      <P>
        Each population eats 1 food (cybernetic races half, lithovores and androids none). Food doesn't move by itself:
        a Freighter Fleet ({PROJECT_COSTS.freighterFleet} production) adds {FREIGHTERS.perFleet} freighters, and each
        carries {FREIGHTERS.foodPerShip} food a turn from colonies with a surplus to hungry ones. A colony whose need is not
        met loses {GROWTH.starvationK}k population a turn for each food it lacks, workers and scientists first. Food nobody needs is sold for {fmt(TRAIT_EFFECTS.normalFoodBc, 1)}{" "}
        BC a unit ({fmt(TRAIT_EFFECTS.traderFoodBc, 1)} for fantastic traders). A blockaded system can neither send nor receive.
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
          and again: each level makes that category's components smaller and adds {RESEARCH.hyperScore} to the score.
        </li>
        <li>Applications you skipped can still be gained: stolen by spies, captured with a colony, found on a derelict ship, or learned from the guardian of Orion.</li>
      </Ul>
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
        need more space on bigger hulls. A module turns the hull into a colony ship, outpost ship or transport.
      </P>
      <Ul>
        <li>The armor grade multiplies the hull's armor and structure (<HelpLink to="page:hulls" />, <HelpLink to="page:armor" />).</li>
        <li>Each weapon mount has a count, optional modifications (heavy, point defense, autofire and so on) and, for beams, a firing arc. Missile mounts also choose how many shots their rack holds (<HelpLink to="page:weapons" />).</li>
        <li>A ship can carry at most eight weapon mounts.</li>
        <li>Combat speed depends on how full the hull is: an empty hull is fast, a packed one slow. Speed gives beam defense; the computer, specials and race picks give attack.</li>
        <li>Ship cost is scaled by your government (<HelpLink to="page:governments" />).</li>
        <li>Cruisers and larger hulls can only be built at colonies with a star base, battlestation or star fortress.</li>
        <li>Mark old designs obsolete to hide them from build lists.</li>
      </Ul>
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
        <li><b>Nebulae</b> slow every ship inside them to {NEBULA_SPEED} parsec a turn, and no shields work in a battle there.</li>
        <li><b>Black holes</b> cannot be entered, and ships cannot fly close past them.</li>
        <li><b>Wormholes</b> link two distant stars; the trip takes one turn and needs no fuel.</li>
        <li>A <b>Star Gate</b> sends ships between any two of your colonies in one turn; a <b>Jump Gate</b> adds {JUMP_GATE_BONUS} to your speed between your colonies.</li>
        <li>An enemy <b>Warp Interdictor</b> slows your ships near its system to a crawl.</li>
        <li>Ships already in flight can only change course with communication techs: Tachyon within 3 parsecs of an orbital base, Subspace within 6, Hyperspace anywhere.</li>
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
        Every ship uses command points by hull size, from 1 for a frigate up to 6 for a doom star. You have{" "}
        {BASE_COMMAND_POINTS} to start with, more from star bases, battlestations, star fortresses, the space academy
        and communication techs; <HelpLink to="trait:warlord" /> races get {TRAIT_EFFECTS.warlordCommandPerColony} more per colony.
        Each point over the limit costs {COMMAND_OVERAGE_COST} BC a turn.
      </P>
      <h3>Stance</h3>
      <Ul>
        <li><b>Defend</b>: fights enemy ships but leaves planets alone.</li>
        <li><b>Attack</b>: also attacks enemy planets' defenses and bombs colonies once they are down.</li>
      </Ul>
      <P>Fleets at the same star can be merged or split from the star panel. New ships join an idle fleet of their kind at the star where they were built.</P>
    </>
  ),

  combat: () => (
    <>
      <P>
        Battles happen when hostile armed fleets meet, or when an armed colony sees enemy ships. They are fought
        automatically on a {FIELD_WIDTH}×{FIELD_HEIGHT} battlefield for up to {MAX_ROUNDS} rounds and can be replayed from
        the turn report. A battle ends when one side has nothing left; if both still stand when time runs out, the
        defender holds the field.
      </P>
      <h3>Moving and firing</h3>
      <Ul>
        <li>Whoever started the fight attacks, unless the battle is at the other side's colony: a colony's owner always defends. The defender deploys on the left, the attacker {DEPLOY.rightColumn - DEPLOY.leftColumn} squares away on the right (a human attacker takes the left instead). Ships line up in a column by size, biggest in the middle; the planet sits behind the defenders with its station in front of it.</li>
        <li>Every round the attacker's ships act first, one after another, then the defender's.</li>
        <li>Ships spend their combat speed to move and turn. Each beam fires only into its arc, so facing matters.</li>
        <li>A beam's hit chance is its attack against the target's beam defense, minus a penalty that grows with range. Damage also drops with range unless the mount ignores it.</li>
        <li>Better rolls do more damage: a shot that barely hits does its minimum, a near-certain one close to its maximum.</li>
        <li>Missiles fly {MISSILE_SPEED.base} squares a round, {MISSILE_SPEED.perDrive} more for every drive after the first; torpedoes keep their own speed. On arrival they can be shot down by point-defense beams, anti-missile rockets or a lightning field, or misled by jammers. Better missiles are harder to shoot down; torpedoes do half damage to planets.</li>
        <li>Fighter and bomber bays launch craft that fly to their target, attack and return to rearm. Craft get faster with better drives and tougher with better armor.</li>
      </Ul>
      <h3>Damage</h3>
      <Ul>
        <li>Shields take their class off every hit, then soak what is left from the pool on the side that was hit. Each side recovers part of its pool every round.</li>
        <li>Damage that gets through wears down armor first, then structure. Hits on structure may knock out weapons, the shield generator, the computer or the drive; losing the drive destroys the ship.</li>
        <li>A ship that loses its drive explodes: {EXPLOSION.perDriveHP} times its hull's drive hit points (a cruiser {EXPLOSION.perDriveHP * HULLS_BY_ID.cruiser.driveHP}, a titan {EXPLOSION.perDriveHP * HULLS_BY_ID.titan.driveHP}), {EXPLOSION.detonatorMult} times that with a Quantum Detonator, which goes off however the ship dies. The blast hits every ship nearby, friend or foe, weaker with distance, and can set off more explosions.</li>
        <li>Armor-piercing and shield-piercing weapons skip part of this, and some specials change it further.</li>
        <li>Repair units fix armor, structure and systems every round.</li>
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
        Ships that escape head to your nearest colony; the rest of their fleet stays to fight.
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
        side at once). The captor keeps it only if its side wins; otherwise it is lost. A ship with a Quantum Detonator
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
        {" "}{PLANET_INSTALLATION_HP} damage that gets through (more with better armor) knocks out one installation at random. Stations are fair game in any
        battle, but only fleets set to attack fire on the planet, and only once no defending ships or station remain.
      </P>
    </>
  ),

  invasion: () => (
    <>
      <P>
        A colony is open to attack when its orbital defenses are silenced in battle, or it has none, and no armed enemy
        ships remain at the star.
      </P>
      <h3>Bombing</h3>
      <P>
        Fleets on <b>Attack</b> stance bomb open colonies every turn. Each bomb loses the planetary shield's worth of
        damage, and every {BOMB_DAMAGE_PER_HIT} points that get through are one hit. A hit lands at random on a building
        (not the colony's defenses), a trained marine or tank, or a colonist; a tank needs at least two hits.
        Death spores and the bio-terminator kill population with a {pct(SPORE_KILL_CHANCE_PER_POINT)} chance per point
        of damage, which every other empire resents. A colony bombed to zero is destroyed.
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
        and a Commando leader in the system adds his skill. A captured colony keeps its buildings and its people, who
        must be assimilated (see Colonies), and has a {pct(CAPTURE_TECH_CHANCE)} chance to yield one of the loser's techs.

      </P>
      <P>
        <HelpLink to="trait:telepathic" /> empires take a colony whose defenses are down without troops, with a cruiser
        or larger in orbit, unless its people are telepathic too. Conquerors outside democracies and federations may
        exterminate a conquered population, which every other empire resents.
      </P>
    </>
  ),

  diplomacy: () => (
    <>
      <P>
        Once you meet an empire you can trade proposals on the <b>Diplomacy</b> screen. Proposals expire after{" "}
        {PROPOSAL_LIFETIME} turns.
      </P>
      <Ul>
        <li><b>War</b>: your ships and theirs fight on sight. Declaring war on someone you had a treaty with angers everyone, and their allies join in. Breaking a peace treaty within {PEACE_TREATY_TURNS} turns is an outrage.</li>
        <li><b>Peace</b>: ends a war.</li>
        <li><b>Non-aggression pact</b>: a promise not to attack; relations warm over time. Not while at war.</li>
        <li><b>Alliance</b>: allies share fuel range and warm faster. Only from a non-aggression pact, and only with an empire whose attitude toward you is at least {TREATY_ANSWER.allianceMinAttitude}.</li>
        <li><b>Trade treaty</b>: both sides earn {TREATY_YIELD.trade.perPop} BC per population of the smaller partner.</li>
        <li><b>Research treaty</b>: both sides gain {TREATY_YIELD.research.perPop} research per population of the smaller partner.</li>
        <li><b>Technology exchange</b>, <b>gifts</b> of BC, techs or systems, and a standing <b>tribute</b> of 5% or 10% of your income.</li>
        <li><b>Demands</b>: tribute, a tech, a system, war on or peace with a third empire, breaking an alliance, recalling spies or fleets. Refusing angers the demander; giving in sours them less than you might fear.</li>
        <li><b>Surrender</b>: hand your whole empire to another ruler.</li>
      </Ul>
      <P>
        Treaty income runs at a loss for the first {TREATY_YIELD.trade.breakEven} turns and only reaches full value after{" "}
        {TREATY_YIELD.trade.full}. <HelpLink to="trait:fantasticTraders" /> earn 25% more from trade treaties; <HelpLink to="trait:repulsive" /> races

        can only make peace or war.
      </P>
      <h3>How computer rulers answer</h3>
      <P>
        A computer ruler accepts a treaty when its attitude toward you, plus a d100, minus what the treaty asks of it
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
        Peace comes only after {TREATY_ANSWER.peaceMinWarTurns} turns of war, and attitude does not count: the longer the
        war, the more other wars they fight, the stronger you are and the more of their systems your ships hold, the
        likelier they agree. Their ships in your systems make them bolder.
      </P>
      <P>
        Every proposal wears down their patience: {PATIENCE.perAsk} points, and {PATIENCE.firstAsk} to{" "}
        {PATIENCE.firstAsk + PATIENCE.firstAskRoll} more for the first in a turn, all of it counted against their next
        answers. Asking for the same kind of thing again and again, or making demands, soon has them refuse to see you.
        Patience comes back by {PATIENCE.recovery} a turn; breaking a treaty exhausts it.
      </P>
      <h3>Attitude</h3>
      <P>
        Every empire has an attitude toward every other, drifting toward a baseline: treaties, alliances and common
        enemies raise it; war, shared borders, caught spies and repulsiveness lower it. Good turns done by a{" "}
        <HelpLink to="trait:charismatic" /> race count double and bad ones half. Charisma (+50), telepathy (+25),
        Xeno Psychology and Diplomat leaders add diplomatic points to every deal an empire offers. Computer empires use it to
        decide what to accept and whom to attack, and how to vote in the council.
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
        Spying comes from race picks (10 per level), techs and Spy Master leaders; security from the same race picks and
        techs, government, security buildings and Telepath leaders. <HelpLink to="trait:telepathic" /> races add
        10 to both. Assassin leaders kill enemy spies before they act.
      </P>
    </>
  ),

  leaders: () => (
    <>
      <P>
        {HEROES.length} legendary leaders roam the galaxy. From turn {LEADER_RULES.firstOfferTurn} one may offer their
        services on the <b>Leaders</b> screen; the longer since the last offer the likelier the next, and the more leaders
        you already have the rarer. Stronger leaders appear as the game goes on. An offer you don't take stays open for
        {" "}{LEADER_RULES.queueTurns} turns. You can employ up to {MAX_LEADERS}, at most {LEADER_RULES.maxPerKind} of each kind.
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
      <P>Only one leader can hold each post. A leader whose post is lost waits at home for a new one.</P>
    </>
  ),

  council: () => (
    <>
      <P>
        If the council is enabled, it first convenes once {pct(COUNCIL.settledShare)} of the galaxy's systems are
        owned (not before turn {COUNCIL_FIRST}, and only while at least {COUNCIL.minEmpires} empires live), then every{" "}
        {COUNCIL_INTERVAL} turns while at least {COUNCIL.minEmpires} empires remain. The two most populous empires stand
        as candidates and every empire gets one vote per {COUNCIL.popPerVote} population.
      </P>
      <P>
        A candidate with {pct(COUNCIL_MAJORITY)} of all votes is elected. Candidates vote for themselves; you can set
        your vote on the Diplomacy screen. Computer empires only back a candidate they clearly like. You may refuse
        another ruler's election on the next turn, but then you are at war with every empire that accepted it.
      </P>
    </>
  ),

  events: () => (
    <>
      <P>
        Random events start on turn {EVENT_START}. Every quiet turn makes the next one likelier (about one in{" "}
        {EVENT_TIMING.dieSides} more per turn, a little less on easier levels), and after an event the galaxy stays calm
        for {EVENT_TIMING.cooldown} turns. Disasters strike the most populous empires, never the smallest; windfalls go to
        the smaller ones. Comets and supernovas don't come before turn 200. They can be switched off when starting a
        game. <HelpLink to="trait:lucky" /> races are spared the disasters and build up to windfalls of their own.
      </P>
      <Ul>
        <li><b>Windfalls</b>: donations, derelict ships and research breakthroughs, new mineral deposits, a planet's axis shifting to a terran climate, population booms, diplomatic marriages.</li>
        <li><b>Disasters</b>: earthquakes, industrial accidents that irradiate a planet, depleted mines, computer viruses, ship explosions, assassinations.</li>
        <li><b>Threats you can fight</b>: a comet bound for a colony (warships in orbit break it up), pirates (send warships to their system), a plague (the colony's research finds a cure) and a supernova (the system's research must stop it).</li>
        <li><b>Hyperspace trouble</b>: flux that stops all ships, a warp beast that eats ships in flight, warp funnels that trap a fleet, unstable wormholes that fling one across the galaxy, and time-space anomalies where nothing can be built or fought.</li>
        <li><b>Monsters</b> from beyond the rim: one turns a system toxic, one kills every colonist, one blockades, one ravages the population, and one demands BC or pillages the system.</li>
      </Ul>
    </>
  ),

  victory: () => (
    <>
      <Ul>
        <li><b>Conquest</b>: be the last empire standing. An empire is out when it has no colonies and no colony ships.</li>
        <li><b>Council</b>: be elected by the <HelpLink to="guide:council">galactic council</HelpLink>.</li>
        <li><b>Raiders</b>: build a Dimensional Portal and send a fleet from that system to destroy the raiders' home fleet and citadel. Every other empire then capitulates (<HelpLink to="page:monsters" />).</li>
        <li><b>Score</b>: only in games started with a turn limit (off by default; the original has none): when it is reached, the highest score wins. Score counts population, colonies, outposts, techs, industry, research and ships.</li>
      </Ul>
      <P>
        Galaxy sizes: {(Object.keys(STAR_COUNTS) as (keyof typeof STAR_COUNTS)[]).map((k) => `${k} ${STAR_COUNTS[k]} stars on ${Math.round(mapSize(k).width)} × ${Math.round(mapSize(k).height)} parsecs`).join(", ")}. Monsters, raiders,
        random events and the council can each be switched off when starting a game. Difficulty sets how fast computer
        empires produce and research and how warmly they treat you; galaxy age changes the mix of star colors, which
        orbits fill up and, in old galaxies, makes middle orbits more fertile;
        the tech level starts everyone pre-warp, average or advanced.

      </P>
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

