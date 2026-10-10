import type { ReactNode } from "react";
import { ALL_DOMAINS, DOMAIN_INFO } from "@starlord/ai";
import {
  ADMIN_SKILLS, BASE_COMMAND_POINTS, BASE_SCAN_RANGE, CAPTAIN_SKILLS, CAPTURE_THRESHOLD, COMMAND_OVERAGE_COST,
  COUNCIL_FIRST, COUNCIL_INTERVAL, COUNCIL_MAJORITY, EVENT_CHANCE, FIELD_HEIGHT, FIELD_WIDTH, GROUND_BASE, GROUND_PER_LEVEL,
  LEADER_OFFER_INTERVAL, MAX_LEADERS, MAX_QUEUE, MAX_ROUNDS, MORALE_RANGE, POP_PER_BOMB_DAMAGE, PROPOSAL_LIFETIME, RESEARCH,
  SKILL_PER_LEVEL, STAR_COUNTS, SUCCESS_THRESHOLD, TAX_PER_POP, TAX_STEPS, TRADE_GOODS_RATE, UNREST_MORALE,
} from "@starlord/sim";
import { fmt, pct, words } from "../ui/format";
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
        result. See <HelpLink to="page:planets" /> and <HelpLink to="page:planetTraits" />.
      </P>
      <h3>Production</h3>
      <P>
        Industry, after pollution and taxes, goes into the colony's build queue (up to {MAX_QUEUE} items). A colony
        finishes at most one item per turn; extra production carries into the next. With an empty queue, or with
        Trade Goods first, production becomes BC at {pct(TRADE_GOODS_RATE)}. Housing turns production into population
        growth instead. <b>Buy</b> completes the first item for BC: twice the remaining cost, or four times if nothing
        has been spent on it yet.
      </P>
      <P>See <HelpLink to="page:buildings" /> and <HelpLink to="page:projects" />.</P>
      <h3>Growth</h3>
      <P>
        Population grows fastest when a colony is half full and stops at its maximum. Each 1,000k of growth adds one
        population unit; new colonists farm if the colony is short of food, otherwise they work.
      </P>
      <h3>Morale</h3>
      <P>
        Morale multiplies food, industry and research and ranges from {MORALE_RANGE[0]}% to +{MORALE_RANGE[1]}%. It comes
        from the government, buildings, techs and administrators. Colonies of another race lose 10% unless they have an
        Alien Management Center, and freshly conquered colonies suffer {UNREST_MORALE}% unrest for a while.
      </P>
      <h3>Pollution</h3>
      <P>
        Industry above 4 × the planet's size factor pollutes: half of the excess is lost. Pollution buildings and techs
        remove part of it; tolerant races never pollute.
      </P>
      <h3>Outposts</h3>
      <P>
        Outposts hold no population and produce nothing, but they claim the planet, extend your fuel range and count
        for score. Asteroids and gas giants take only outposts.
      </P>
    </>
  ),

  economy: () => (
    <>
      <h3>BC income</h3>
      <P>
        Each population pays {fmt(TAX_PER_POP, 1)} BC a turn before race, tech and building bonuses. The tax rate on the
        Empire screen ({TAX_STEPS.map(pct).join(", ")}) turns that share of every colony's industry into BC. Gold and
        gem deposits pay extra, and trade treaties add more (<HelpLink to="guide:diplomacy" />).
      </P>
      <h3>Costs</h3>
      <Ul>
        <li>Every building has BC upkeep each turn.</li>
        <li>Hired leaders draw a salary (<HelpLink to="guide:leaders" />).</li>
        <li>Every command point your warships use over your limit costs {COMMAND_OVERAGE_COST} BC a turn (<HelpLink to="guide:fleets" />).</li>
      </Ul>
      <P>
        If the treasury goes below zero, buildings are sold off, highest upkeep first, for a quarter of their cost until
        the books balance.
      </P>
      <h3>Food</h3>
      <P>
        Each population eats 1 food (cybernetic races half, lithovores none). Food is pooled across your empire, so a
        farming world can feed an industrial one. If the whole empire runs short, the hungriest colonies lose population.
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
          Once the research points reach a field's cost, a breakthrough can come any turn ({Math.round(RESEARCH.breakthroughStartChance * 100)}%
          chance at first, rising to certain at {RESEARCH.maxCostMult}x the cost). Points past the cost carry into the next field.
        </li>
        <li>
          When a category is finished, its hyper-advanced field ({fmt(RESEARCH.hyperCost)} RP) can be researched again
          and again: each level makes that category's components smaller and adds {RESEARCH.hyperScore} to the score.
        </li>
        <li>Applications you skipped can still be gained: stolen by spies, captured with a colony, found on a derelict ship, or learned from the guardian of Orion.</li>
      </Ul>
      <h3>Miniaturization</h3>
      <P>
        Every tier you research in a field after the one that gave a ship component makes that component 10% smaller
        and cheaper, down to half its size. Old weapons become cheap filler on big hulls.
      </P>
    </>
  ),

  design: () => (
    <>
      <P>
        On the <b>Ship design</b> screen you pick a hull, armor, an optional shield and computer, weapons and special
        systems. Everything must fit in the hull's space; shields, computers and specials take a share of it, so
        they cost more space on bigger hulls. A module turns the hull into a colony ship, outpost ship or transport.
      </P>
      <Ul>
        <li>Hit points come from the hull's structure plus its armor base times the armor grade (<HelpLink to="page:hulls" />, <HelpLink to="page:armor" />).</li>
        <li>Beam defense comes from the hull size, specials, race picks and combat speed; attack from the computer, specials and race picks.</li>
        <li>Ship cost is scaled by your government (<HelpLink to="page:governments" />).</li>
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
        your colonies and outposts. See <HelpLink to="page:drives" />.
      </P>
      <h3>Scanners</h3>
      <P>Your colonies and ships see {BASE_SCAN_RANGE} parsecs around them, more with scanner techs. Empires meet when their scanners overlap.</P>
      <h3>Command points</h3>
      <P>
        Armed ships use command points by hull size; scouts, colony ships, outposts and transports are free. You have{" "}
        {BASE_COMMAND_POINTS} to start with, more from star bases, the space academy and communication techs. Each point
        over the limit costs {COMMAND_OVERAGE_COST} BC a turn.
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
        Battles happen when hostile armed fleets meet, or when an armed planet sees enemy ships. They are fought
        automatically on a {FIELD_WIDTH}×{FIELD_HEIGHT} battlefield for up to {MAX_ROUNDS} rounds and can be replayed from
        the turn report.
      </P>
      <Ul>
        <li>Faster ships act first. Each ship closes to its preferred range and fires everything in range.</li>
        <li>Beams hit with 50% + (attack − defense)%, between 5% and 95%. Beyond half range they do a quarter less damage.</li>
        <li>Shields subtract from every beam hit and half as much from missiles and torpedoes. Some weapons pierce shields.</li>
        <li>Missiles and torpedoes have limited volleys; point defense can shoot them down and ECM can dodge them (half as well against torpedoes).</li>
        <li>Unarmed ships try to slip away each round.</li>
        <li>Repair systems restore hit points every round.</li>
      </Ul>
      <h3>Combat doctrine</h3>
      <P>
        On the <b>Fleets</b> screen you set when your fleets retreat (when their strength drops below a share of the
        enemy's) and whom they target first: the nearest, weakest or strongest enemy. Retreating fleets head to your
        nearest colony.
      </P>
      <h3>Planets</h3>
      <P>
        Star bases, missile bases, ground batteries and shields defend a colony (<HelpLink to="page:buildings" />). Planet
        guns use your best known beam and missile. Ships only shoot at a planet when their fleet is set to attack, and
        only after the planet's defending ships are gone.
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
        Fleets on <b>Attack</b> stance bomb open colonies every turn. Each {fmt(1 / POP_PER_BOMB_DAMAGE)} points of bomb
        damage kill about one population and may destroy a building. Spores kill population directly. A colony bombed to
        zero is destroyed.
      </P>
      <h3>Invasion</h3>
      <P>
        Select a fleet carrying troops (transports, troop pods or assault shuttles) at the star and press <b>Invade</b>.
        The troops land when the defenses are down and fight the defenders one by one. Defenders are the colony's
        barracks troops plus one per two population, and fight from prepared positions.
      </P>
      <P>
        Ground strength is {GROUND_BASE} + {GROUND_PER_LEVEL} per ground combat level, from race picks and techs such as
        powered armor and personal shields. A captured colony keeps its people and buildings, suffers unrest, and may
        yield one of the loser's techs.
      </P>
    </>
  ),

  diplomacy: () => (
    <>
      <P>Once you meet an empire you can trade proposals on the <b>Diplomacy</b> screen. Proposals expire after {PROPOSAL_LIFETIME} turns.</P>
      <Ul>
        <li><b>War</b>: your ships and theirs fight on sight. Declaring war on someone you had a treaty with angers everyone, and their allies join in.</li>
        <li><b>Ceasefire / peace</b>: ends a war.</li>
        <li><b>Alliance</b>: needs peace first.</li>
        <li><b>Trade treaty</b>: both sides earn BC that grows with the smaller partner's population.</li>
        <li><b>Research treaty</b>: both sides gain research that grows with the smaller partner's research.</li>
      </Ul>
      <P>Treaty income starts small and ramps up over ten turns. <HelpLink to="trait:fantasticTraders" /> double trade income; <HelpLink to="trait:repulsive" /> races can't sign alliances or treaties.</P>
      <h3>Attitude</h3>
      <P>
        Every empire has an attitude toward every other, drifting toward a baseline: treaties, alliances, common enemies
        and charisma raise it; war, shared borders, caught spies and repulsiveness lower it. Computer empires use it to
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
        Each turn every spy abroad rolls 1–100, plus 10 per point your spying beats their security, minus 2 per spy
        they keep at home. {SUCCESS_THRESHOLD} or more succeeds; {CAPTURE_THRESHOLD} or less gets the spy caught.
        Telepathic targets are much harder to crack. Successful spies are sometimes identified, which hurts relations.
      </P>
      <P>Spying comes from race picks and techs; security from race picks, government, techs and security buildings.</P>
    </>
  ),

  leaders: () => (
    <>
      <P>
        Every {LEADER_OFFER_INTERVAL} turns or so a leader offers their services on the <b>Leaders</b> screen. You can
        employ up to {MAX_LEADERS}. Leaders have a level from 1 to 5; higher levels have more and stronger skills, cost
        more to hire, and draw their level in BC salary each turn.
      </P>
      <Ul>
        <li>
          <b>Administrators</b> govern a star system and boost every colony in it:{" "}
          {ADMIN_SKILLS.map((s) => `${words(s)} +${SKILL_PER_LEVEL[s]}% per level`).join(", ")}.
        </li>
        <li>
          <b>Captains</b> command a fleet in battle:{" "}
          {CAPTAIN_SKILLS.map((s) => `${words(s)} +${SKILL_PER_LEVEL[s]} per level`).join(", ")}.
        </li>
      </Ul>
      <P>Only one leader can hold each post. A captain whose fleet is destroyed returns to the pool.</P>
    </>
  ),

  council: () => (
    <>
      <P>
        If the council is enabled, it first meets on turn {COUNCIL_FIRST} and then every {COUNCIL_INTERVAL} turns, as
        long as at least three empires remain. The two most populous empires stand as candidates and every empire votes
        with a weight based on its population.
      </P>
      <P>
        A candidate with {pct(COUNCIL_MAJORITY)} of all votes wins the game. Candidates vote for themselves; you can set
        your vote on the Diplomacy screen. Computer empires only back a candidate they clearly like, so good relations
        matter.
      </P>
    </>
  ),

  events: () => (
    <P>
      From turn 20 on, each turn has a {pct(EVENT_CHANCE)} chance of a random event striking one empire: a plague, a
      prospectors' gold strike, a derelict ship that teaches a tech, a comet that wrecks a building, or a baby boom.
    </P>
  ),

  victory: () => (
    <>
      <Ul>
        <li><b>Conquest</b>: be the last empire standing. An empire is out when it has no colonies and no colony ships.</li>
        <li><b>Council</b>: be elected by the <HelpLink to="guide:council">galactic council</HelpLink>.</li>
        <li><b>Raiders</b>: build a dimensional portal and destroy the raiders at their home (<HelpLink to="page:monsters" />).</li>
        <li><b>Score</b>: when the turn limit is reached, the highest score wins. Score counts population, colonies, outposts, techs, industry, research and ships.</li>
      </Ul>
      <P>
        Galaxy sizes: {Object.entries(STAR_COUNTS).map(([k, v]) => `${k} ${v} stars`).join(", ")}. Monsters, raiders and
        the council can each be switched off when starting a game.
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
        {ALL_DOMAINS.map((d) => <li key={d}><b>{DOMAIN_INFO[d].name}</b>: {DOMAIN_INFO[d].description}</li>)}
      </Ul>
      <P>With everything automated you can watch the game play itself, or start a new game as a spectator.</P>
    </>
  ),
};

