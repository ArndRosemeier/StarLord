import type { ReactNode } from "react";
import {
  ALL_WEAPONS, ARMORS, ARMORS_BY_ID, BUILDINGS, BUILDINGS_BY_ID, CLIMATES, COMPUTERS, COMPUTERS_BY_ID, CUSTOM_RACE_POINTS,
  DRIVES, EXCLUSIVE_TRAITS, FIELD_NAMES, FUEL_RANGES, GOVERNMENTS, GOVERNMENT_COSTS, HULLS, HULLS_BY_ID, INDUSTRY_PER_WORKER,
  LAIR_MONSTERS, MAX_NEGATIVE_POINTS, MINERAL_WEIGHTS_BY_STAR, MODULES, MONSTER_DESIGNS, NPC_WEAPONS, PICK_OPTIONS,
  PLANETS_PER_STAR, PLANET_SIZE_WEIGHTS, PLANET_TYPE_WEIGHTS, PROJECTS, PROJECTS_BY_ID, PROJECT_COSTS, RACES, RACES_BY_ID,
  RAIDER_CITADEL, RAIDER_CITADEL_ID, RAIDER_DESIGNS, RAIDER_HULLS, RAIDER_SHIP_NAMES, RAID_BUDGET_MULT, RAID_BUDGET_PERIOD, RAID_DESTROYER_WINDOW, RAID_FLEET_CAP,
  RAID_FRIGATE_WINDOW, RAID_GRACE_TURNS, RAID_HOME_MIN_TITANS, RAID_HOME_QUOTA, RAID_HUMAN_POP_MULT, RAID_LAUNCH_ROLL, RAID_LAUNCH_VALUE_MULT, RAID_MAX_SHIPS,
  RAID_TITAN_DISCOUNT, RAIDER_HULL_COST, BOMB_DAMAGE_PER_HIT, crewName, type Difficulty, type WeaponMount, SCRAP_TECH_CHANCE, SHIELDS, SHIELDS_BY_ID, POLLUTION_TOLERANCE, SIZE_FACTOR, SIZE_POP_BASE, SPECIALS, SPECIALS_BY_ID, climatePopulation,
  RESEARCH, STARTING_TECH_APPS, STARTING_TIERS, STAR_COLOR_WEIGHTS, TECHS, TECH_FIELDS, TECH_TIERS, TERRAFORM_STEP,
  TIERS_BY_ID, TRAIT_COSTS, WEAPONS, WEAPONS_BY_ID, nextTier, previousTier, ARCS, MISSILE_RACKS, STATION_HULLS,
  WEAPON_MODS, WEAPON_MODS_BY_ID, SHIELD_SPACE_BY_HULL, SHIELD_COST_BY_HULL, COMPUTER_COST_BY_HULL,
  cumulativeTierCost, fleetRange, fleetSpeed, gravityMultiplier, gravityOf, citadelDesign, techHasEffect,
  techInfo, techUnlocks, type GovernmentDef, type Minerals, type NumericPick, type PlanetSize, type PlanetType, type Player,
  type RaceDef, type RaceTrait, type ShipDesign, type StarColor, type TechTier, type Unlock, type WeaponDef,
} from "@starlord/sim";
import { fmt, pct, signed, words } from "../ui/format";
import { ENTRIES_BY_ID, traitName, unlockEntryId } from "./entries";
import { buildingEffects, empireBonus, specialEffects } from "./effects";
import { GUIDE } from "./guide";
import { HelpLink, useHelpNav } from "./HelpDialog";

/** Renders one encyclopedia page from the rules tables. */
export function Article({ id }: { id: string }) {
  const entry = ENTRIES_BY_ID.get(id);
  const sep = id.indexOf(":");
  const kind = id.slice(0, sep);
  const key = id.slice(sep + 1);
  if (!entry) return <p className="muted">This page does not exist.</p>;
  const body = (() => {
    switch (kind) {
      case "guide": return GUIDE[key as keyof typeof GUIDE]();
      case "page": return PAGES[key]?.() ?? null;
      case "field": return <FieldPage field={key as TechTier["field"]} />;
      case "tier": return <TierPage tier={TIERS_BY_ID[key]!} />;
      case "tech": return <TechPage id={key} />;
      case "building": return <BuildingPage id={key} />;
      case "project": return <ProjectPage id={key} />;
      case "hull": return <HullPage id={key} />;
      case "weapon": return <WeaponPage w={WEAPONS_BY_ID[key]!} />;
      case "armor": return <ArmorPage id={key} />;
      case "shield": return <ShieldPage id={key} />;
      case "computer": return <ComputerPage id={key} />;
      case "special": return <SpecialPage id={key} />;
      case "module": return <ModulePage id={key as keyof typeof MODULES} />;
      case "climate": return <ClimatePage type={key as PlanetType} />;
      case "race": return <RacePage race={RACES_BY_ID[key]!} />;
      case "trait": return <TraitPage trait={key as RaceTrait} />;
      case "government": return <GovernmentPage id={key as keyof typeof GOVERNMENTS} />;
      case "monster": return <MonsterPage id={key} />;
      default: return null;
    }
  })();
  return (
    <article className="col help-page">
      <div>
        <h2 style={{ marginBottom: 2 }}>{entry.title}</h2>
        {entry.subtitle && <div className="muted">{entry.subtitle}</div>}
      </div>
      {body}
    </article>
  );
}

// ---------------------------------------------------------------- shared bits

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="help-facts">
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
      </tbody>
    </table>
  );
}

function List({ items, empty }: { items: ReactNode[]; empty?: string }) {
  if (items.length === 0) return empty ? <span className="muted">{empty}</span> : null;
  return <ul className="help-ul">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

/** Comma-separated links. */
function Links({ ids }: { ids: string[] }) {
  return <>{ids.map((id, i) => <span key={id}>{i > 0 && ", "}<HelpLink to={id} /></span>)}</>;
}

/** Link to the tech that unlocks something, or a note when it cannot be researched. */
export function Requires({ tech }: { tech: string | null }) {
  if (tech === null) return <span>Available from the start</span>;
  if (STARTING_TECH_APPS.includes(tech)) return <span>Available from the start</span>;
  const info = techInfo(tech);
  if (!info) return <span>Not in the tech tree: only salvaged (see <HelpLink to="page:monsters" />)</span>;
  return <span><HelpLink to={`tech:${tech}`} /> <small className="muted">({FIELD_NAMES[info.tier.field]}, {info.tier.name})</small></span>;
}

function KnownChip({ tech }: { tech: string }) {
  const { me } = useHelpNav();
  if (!me) return null;
  return me.techs.includes(tech) ? <span className="chip good">Known</span> : <span className="chip">Not known yet</span>;
}

/** What a tech does, in one line. */
export function techSummary(id: string): string {
  const t = TECHS[id]!;
  const parts: string[] = [];
  if (t.description) parts.push(t.description);
  else if (t.bonus) parts.push(empireBonus(t.bonus).join(", "));
  const unlocks = techUnlocks(id).map((u) => u.name);
  if (unlocks.length && !t.description) parts.push(`Unlocks ${unlocks.join(", ")}.`);
  return parts.join(" ") || "No effect in the rules yet.";
}

const dmg = (w: WeaponDef) => (w.damageMin === w.damageMax ? `${w.damageMin}` : `${w.damageMin}–${w.damageMax}`);

/** Key numbers of something a tech unlocks, so the tech page carries the full data. */
export function unlockSummary(u: Unlock): string {
  switch (u.kind) {
    case "building": {
      const b = BUILDINGS_BY_ID[u.id]!;
      return `${fmt(b.cost)} production, ${b.maintenance} BC upkeep. ${buildingEffects(b.effects).join(", ")}.`;
    }
    case "project": return PROJECTS_BY_ID[u.id]!.description;
    case "hull": {
      const h = HULLS_BY_ID[u.id as keyof typeof HULLS_BY_ID];
      return `Space ${h.space}, armor ${h.armor} and structure ${h.structure} (times the armor grade), size class ${h.sizeClass}, cost ${h.cost}, ${h.commandPoints} command.`;
    }
    case "weapon": {
      const w = WEAPONS_BY_ID[u.id]!;
      return `${words(w.kind)}: ${dmg(w)} damage, base space ${w.space}, cost ${w.cost}${w.ammo ? `, ${w.ammo} shots` : ""}${w.mods.length ? `, takes ${w.mods.length} mods` : ""}.`;
    }
    case "armor": return `Armor grade ×${ARMORS_BY_ID[u.id]!.mult}.`;
    case "shield": return `Stops ${SHIELDS_BY_ID[u.id]!.absorb} damage per hit, with ${SHIELDS_BY_ID[u.id]!.absorb * 5} points per facing per size class.`;
    case "computer": return `${signed(COMPUTERS_BY_ID[u.id]!.attack)} beam attack; takes no space.`;
    case "special": return `${specialEffects(SPECIALS_BY_ID[u.id]!.effects).join(", ")}; ${SPECIALS_BY_ID[u.id]!.space.join("/")} space by hull.`;
    case "drive": {
      const d = DRIVES.find((x) => x.tech === u.id)!;
      return `Ships move ${d.speed} parsecs per turn; combat speed ${d.combatFull[0]}–${d.combatEmpty[0]} on a frigate.`;
    }
    case "fuel": {
      const f = FUEL_RANGES.find((x) => x.tech === u.id)!;
      return f.range >= 99 ? "Unlimited fuel range." : `Fuel range ${f.range} parsecs.`;
    }
    case "module": {
      const m = MODULES[u.id as keyof typeof MODULES];
      return `Space ${m.space}, cost ${m.cost}, needs at least a ${HULLS_BY_ID[m.minHull].name} hull.`;
    }
  }
}

const noTech = { techs: [], tiers: [], raceId: RACES[0]!.id, government: "dictatorship" } as unknown as Player;

/** Space and cost of a component on each hull, before miniaturization. */
function SpaceByHull({ space, cost }: { space: number[]; cost: number[] }) {
  return (
    <table>
      <thead><tr><th>Hull</th>{HULLS.map((h) => <th key={h.id}>{h.name}</th>)}</tr></thead>
      <tbody>
        <tr><td>Space</td>{HULLS.map((h, i) => <td key={h.id}>{space[i] ?? 0}</td>)}</tr>
        <tr><td>Cost</td>{HULLS.map((h, i) => <td key={h.id}>{cost[i] ?? 0}</td>)}</tr>
      </tbody>
    </table>
  );
}

const miniNote = (
  <p className="muted">
    Miniaturization: each later level researched in the same field shrinks the part and makes it cheaper, down to a
    floor. Weapons also unlock their stronger modifications this way. See <HelpLink to="guide:design" />.
  </p>
);

/** Total hit points (armor plus structure) of a hull with a given armor grade. */
const hullHits = (h: { armor: number; structure: number }, mult: number) => (h.armor + h.structure) * mult;

// ---------------------------------------------------------------- technology

const startsKnown = (t: TechTier) => STARTING_TIERS.includes(t.id);
const tierCost = (t: TechTier) => (startsKnown(t) ? "known from the start" : `${fmt(t.cost)} RP`);

function TechTreePage() {
  const { me } = useHelpNav();
  const rungs = Math.max(...TECH_TIERS.map((t) => t.rung));
  return (
    <div className="col">
      <p>
        Research runs in eight categories. Each category is a chain of fields; finishing a field opens the next one.
        General fields give every race all their applications; any other field gives you the one application you
        picked (creative races get all of them, uncreative races one at random). Every field has its own cost, shown
        under its name. The general fields are known from the start. When a category is finished, its hyper-advanced
        field can be researched again and again. Click any name for its full data.
        {me && " Applications you know are marked green."}
      </p>
      <div className="help-tree" style={{ gridTemplateColumns: `32px repeat(${TECH_FIELDS.length}, minmax(112px, 1fr))` }}>
        <div className="help-tree-head" style={{ textAlign: "right" }}>#</div>
        {TECH_FIELDS.map((f) => <div key={f} className="help-tree-head"><HelpLink to={`field:${f}`} /></div>)}
        {Array.from({ length: rungs + 1 }, (_, rung) => [
          <div key={`l${rung}`} className="help-tree-level">{rung + 1}</div>,
          ...TECH_FIELDS.map((f) => {
            const tier = TECH_TIERS.find((t) => t.field === f && t.rung === rung);
            if (!tier) return <div key={`${f}${rung}`} />;
            const done = me?.tiers.includes(tier.id);
            return (
              <div key={tier.id} className={`help-tree-cell${done ? " done" : ""}`}>
                <HelpLink to={`tier:${tier.id}`} />
                <small className="muted"> {startsKnown(tier) ? "start" : fmt(tier.cost)}{tier.general ? ", general" : ""}</small>
                <div className="help-tree-techs">
                  {tier.techs.map((t) => (
                    <span key={t} className={`help-tech${me?.techs.includes(t) ? " known" : ""}${techHasEffect(t) ? "" : " empty"}`}>
                      <HelpLink to={`tech:${t}`} />
                    </span>
                  ))}
                </div>
              </div>
            );
          }),
        ])}
      </div>
      <small className="muted">Faded applications have no effect in the rules yet.</small>
    </div>
  );
}

function TechListPage() {
  const { me } = useHelpNav();
  return (
    <div className="col">
      <p>Every application with its category, field, research cost and effect.</p>
      <table className="help-table">
        <thead><tr><th>Application</th><th>Category</th><th>Field</th><th>RP</th><th>Effect</th></tr></thead>
        <tbody>
          {TECH_TIERS.flatMap((tier) => tier.techs.map((id) => (
            <tr key={id} className={me?.techs.includes(id) ? "help-known" : ""}>
              <td><HelpLink to={`tech:${id}`} /></td>
              <td>{FIELD_NAMES[tier.field]}</td>
              <td><HelpLink to={`tier:${tier.id}`} /></td>
              <td>{startsKnown(tier) ? "start" : fmt(tier.cost)}</td>
              <td className={techHasEffect(id) ? "" : "muted"}>{techSummary(id)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}

function FieldPage({ field }: { field: TechTier["field"] }) {
  const tiers = TECH_TIERS.filter((t) => t.field === field);
  const normal = tiers.filter((t) => !t.hyper);
  return (
    <div className="col">
      <p>
        {normal.length} fields, {fmt(cumulativeTierCost(normal.at(-1)!))} research points to finish the category.
        Each field needs the one above it.
      </p>
      {tiers.map((t) => (
        <div key={t.id} className="panel col help-tier">
          <div className="row">
            <b><HelpLink to={`tier:${t.id}`} /></b>
            <span className="muted">{t.hyper ? `${fmt(t.cost)} RP per level, repeatable` : tierCost(t)}{t.general ? " · general" : ""}</span>
          </div>
          {t.hyper
            ? <span>Each level makes this category's components smaller and cheaper and adds {RESEARCH.hyperScore} to your score.</span>
            : <List items={t.techs.map((id) => <><HelpLink to={`tech:${id}`} />: <span className={techHasEffect(id) ? "" : "muted"}>{techSummary(id)}</span></>)} />}
        </div>
      ))}
    </div>
  );
}

function TierPage({ tier }: { tier: TechTier }) {
  const prev = previousTier(tier);
  const next = nextTier(tier);
  return (
    <div className="col">
      <Facts rows={[
        ["Category", <HelpLink to={`field:${tier.field}`} />],
        ["Tech level", tier.level],
        ["Cost", tier.hyper
          ? `${fmt(tier.cost)} RP per level`
          : startsKnown(tier) ? "Known from the start" : `${fmt(tier.cost)} RP (${fmt(cumulativeTierCost(tier))} RP for the whole chain up to here)`],
        ["Requires", prev ? <HelpLink to={`tier:${prev.id}`} /> : "Nothing"],
        ["Leads to", next ? <HelpLink to={`tier:${next.id}`} /> : tier.hyper ? "Itself: it can be researched again" : "End of the category"],
      ]} />
      {tier.hyper ? (
        <p>
          A hyper-advanced field. It opens once every other field of the category is researched and can be researched
          again and again. Each level makes this category's ship components smaller and cheaper and adds{" "}
          {RESEARCH.hyperScore} to your score.
        </p>
      ) : (
        <>
          <h3>{tier.general ? "Every race learns all of these" : "Choose one"}</h3>
          <List items={tier.techs.map((id) => <><HelpLink to={`tech:${id}`} />: <span className={techHasEffect(id) ? "" : "muted"}>{techSummary(id)}</span></>)} />
        </>
      )}
    </div>
  );
}

function TechPage({ id }: { id: string }) {
  const tech = TECHS[id]!;
  const info = techInfo(id);
  const unlocks = techUnlocks(id);
  const bonus = tech.bonus ? empireBonus(tech.bonus) : [];
  return (
    <div className="col">
      <div className="row"><KnownChip tech={id} />{!techHasEffect(id) && <span className="chip warn">No effect in the rules yet</span>}</div>
      {tech.description && <p>{tech.description}</p>}
{info ? (
        <Facts rows={[
          ["Category", <HelpLink to={`field:${info.tier.field}`} />],
          ["Field", <HelpLink to={`tier:${info.tier.id}`} />],
          ["Research cost", startsKnown(info.tier) ? "Known from the start" : `${fmt(info.tier.cost)} RP for the field`],
          ["Requires", info.prerequisite ? <><HelpLink to={`tier:${info.prerequisite.id}`} /> researched</> : "Nothing"],
          ["Alternatives", info.tier.general ? "None: everyone learns the whole field" : info.alternatives.length ? <Links ids={info.alternatives.map((a) => `tech:${a}`)} /> : "None: the field offers only this application"],
          ["Leads to", info.leadsTo ? <HelpLink to={`tier:${info.leadsTo.id}`} /> : "End of the category"],
        ]} />
      ) : (
        <p className="muted">{STARTING_TECH_APPS.includes(id) ? "Known by every empire from the start." : "Xenon technology: never researched, only salvaged."}</p>
      )}
      {bonus.length > 0 && <><h3>Empire-wide effect</h3><List items={bonus} /></>}
      {unlocks.length > 0 && (
        <>
          <h3>Unlocks</h3>
          <List items={unlocks.map((u) => <><HelpLink to={unlockEntryId(u)}>{u.name}</HelpLink> <span className="muted">· {unlockSummary(u)}</span></>)} />
          {unlocks.some((u) => ["weapon", "shield", "computer", "special"].includes(u.kind)) && miniNote}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- colonies

const replacedBy = (id: string) => BUILDINGS.filter((b) => b.replaces?.includes(id)).map((b) => `building:${b.id}`);

function BuildingsPage() {
  return (
    <div className="col">
      <p>
        Buildings are built from a colony's production queue, one item per turn at most. Each costs BC upkeep every
        turn. A building that replaces another removes it when finished.
      </p>
      <table className="help-table">
        <thead><tr><th>Building</th><th>Cost</th><th>Upkeep</th><th>Effect</th><th>Requires</th></tr></thead>
        <tbody>
          {BUILDINGS.map((b) => (
            <tr key={b.id}>
              <td><HelpLink to={`building:${b.id}`} /></td>
              <td>{fmt(b.cost)}</td>
              <td>{b.maintenance}</td>
              <td>{buildingEffects(b.effects).join(", ")}</td>
              <td><Requires tech={b.requires} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuildingPage({ id }: { id: string }) {
  const b = BUILDINGS_BY_ID[id]!;
  const after = replacedBy(id);
  return (
    <div className="col">
      <p>{b.description}</p>
      <Facts rows={[
        ["Cost", `${fmt(b.cost)} production`],
        ["Upkeep", `${b.maintenance} BC per turn`],
        ["Requires", <Requires tech={b.requires} />],
        ...(b.replaces?.length ? [["Replaces", <Links ids={b.replaces.map((r) => `building:${r}`)} />] as [string, ReactNode]] : []),
        ...(after.length ? [["Superseded by", <Links ids={after} />] as [string, ReactNode]] : []),
      ]} />
      <h3>Effects</h3>
      <List items={buildingEffects(b.effects)} />
    </div>
  );
}

function projectCost(id: string): string {
  if (id === "terraform") return `${fmt(PROJECT_COSTS.terraformBase)} × (times this planet was terraformed + 1)`;
  if (id === "housing") return "Never finishes: turns the colony's production into population growth";
  const c = (PROJECT_COSTS as Record<string, number>)[id];
  return c === undefined ? "–" : `${fmt(c)} production`;
}

function ProjectsPage() {
  return (
    <div className="col">
      <p>Projects are one-off works a colony can queue instead of a building. Most can be repeated.</p>
      <table className="help-table">
        <thead><tr><th>Project</th><th>Cost</th><th>Requires</th><th>Effect</th></tr></thead>
        <tbody>
          {PROJECTS.map((p) => (
            <tr key={p.id}><td><HelpLink to={`project:${p.id}`} /></td><td>{projectCost(p.id)}</td><td><Requires tech={p.requires} /></td><td>{p.description}</td></tr>
          ))}
          <tr><td>Trade Goods</td><td>Never finishes</td><td>Available from the start</td><td>Converts production into BC. An empty queue does this automatically.</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function ProjectPage({ id }: { id: string }) {
  const p = PROJECTS_BY_ID[id]!;
  return (
    <div className="col">
      <p>{p.description}</p>
      <Facts rows={[["Cost", projectCost(id)], ["Requires", <Requires tech={p.requires} />]]} />
      {id === "terraform" && (
        <>
          <h3>Terraforming steps</h3>
          <table className="help-table">
            <thead><tr><th>From</th><th>Becomes</th></tr></thead>
            <tbody>
              {Object.entries(TERRAFORM_STEP).map(([from, to]) => (
                <tr key={from}><td><HelpLink to={`climate:${from}`} /></td><td>{to.map((t, i) => <span key={t}>{i > 0 ? " or " : ""}<HelpLink to={`climate:${t}`} /></span>)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ships

function HullsPage() {
  return (
    <div className="col">
      <p>
        The hull sets how much space a design has, its armor and structure before the armor grade multiplies them, its
        size class (which scales shields and some weapons) and its marines. Every warship uses command points; going
        over your limit costs BC (see <HelpLink to="guide:fleets" />). Cruisers and larger hulls can only be built at
        a colony with an orbital station.
      </p>
      <table className="help-table">
        <thead><tr><th>Hull</th><th>Space</th><th>Cost</th><th>Armor</th><th>Structure</th><th>Size class</th><th>Marines</th><th>Command</th><th>Requires</th></tr></thead>
        <tbody>
          {HULLS.map((h) => (
            <tr key={h.id}>
              <td><HelpLink to={`hull:${h.id}`} /></td><td>{h.space}</td><td>{h.cost}</td><td>{h.armor}</td><td>{h.structure}</td>
              <td>{h.sizeClass}</td><td>{h.marines}</td><td>{h.commandPoints}</td><td><Requires tech={h.requires} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Orbital stations</h3>
      <p>
        Stations are buildings, but they fight as immobile ships fitted automatically with your best weapons, armor,
        shield and computer. They are easy to hit, never run out of ammunition and fire in every direction. Losing one in
        battle destroys the building.
      </p>
      <table className="help-table">
        <thead><tr><th>Station</th><th>Space</th><th>Cost</th><th>Armor</th><th>Structure</th><th>Beam defense</th></tr></thead>
        <tbody>
          {STATION_HULLS.map((h) => (
            <tr key={h.id}><td><HelpLink to={`building:${h.id}`} /></td><td>{h.space}</td><td>{h.cost}</td><td>{h.armor}</td><td>{h.structure}</td><td>{signed(h.fixedDefense ?? 0)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HullPage({ id }: { id: string }) {
  const h = HULLS_BY_ID[id as keyof typeof HULLS_BY_ID];
  const index = HULLS.findIndex((x) => x.id === h.id);
  return (
    <div className="col">
      <Facts rows={[
        ["Space", h.space], ["Base cost", `${h.cost} production`], ["Armor", `${h.armor} points per armor grade`],
        ["Structure", `${h.structure} points per armor grade`], ["Size class", h.sizeClass], ["Marines", h.marines],
        ["Command points", h.commandPoints], ["Requires", <Requires tech={h.requires} />],
      ]} />
      <h3>Hit points by armor</h3>
      <table className="help-table">
        <thead><tr>{ARMORS.map((a) => <th key={a.id}><HelpLink to={`armor:${a.id}`}>{a.name}</HelpLink></th>)}</tr></thead>
        <tbody><tr>{ARMORS.map((a) => <td key={a.id}>{hullHits(h, a.mult)}</td>)}</tr></tbody>
      </table>
      <p className="muted">Heavy Armor and Reinforced Hull raise these further. Modules that fit: {Object.entries(MODULES).filter(([, m]) => HULLS.findIndex((x) => x.id === m.minHull) <= index).map(([, m]) => m.name).join(", ") || "none"}.</p>
    </div>
  );
}

const speedText = (w: WeaponDef) => (w.speed === undefined ? "–" : Number.isFinite(w.speed) ? `${w.speed}` : "instant");

function weaponRow(w: WeaponDef) {
  return (
    <tr key={w.id}>
      <td><HelpLink to={`weapon:${w.id}`} /></td><td>{words(w.kind)}</td><td>{dmg(w)}</td>
      <td>{w.space}</td><td>{w.cost}</td><td>{w.ammo ?? "–"}</td><td>{speedText(w)}</td>
      <td>{w.mods.map((m) => WEAPON_MODS_BY_ID[m].abbr).join(" ") || "–"}</td>
      <td><Requires tech={w.requires} /></td>
    </tr>
  );
}

function WeaponsPage() {
  return (
    <div className="col">
      <p>
        Beams fire every round; their chance to hit and their damage both fall off with range. Missiles fly across the
        field and can be shot down or jammed; torpedoes reload every other round. Bombs and spores only work against
        colonies. Missiles add the space of their rack to the numbers below. See <HelpLink to="guide:combat" />.
      </p>
      <table className="help-table">
        <thead><tr><th>Weapon</th><th>Kind</th><th>Damage</th><th>Space</th><th>Cost</th><th>Shots</th><th>Speed</th><th>Mods</th><th>Requires</th></tr></thead>
        <tbody>{WEAPONS.map(weaponRow)}</tbody>
      </table>
      <h3>Modifications</h3>
      <p>
        Each mount can take modifications that change its size and cost by a percentage. Heavy and point-defense mounts
        scale the base size; the rest add on top. Most need the weapon refined by later research in its field.
      </p>
      <table className="help-table">
        <thead><tr><th>Mod</th><th>Name</th><th>Size and cost</th><th>Refinement levels</th></tr></thead>
        <tbody>{WEAPON_MODS.map((m) => (
          <tr key={m.id}><td>{m.abbr}</td><td>{m.name}</td><td>{signed(m.pct)}%</td><td>{m.refinement}</td></tr>
        ))}</tbody>
      </table>
      <h3>Firing arcs</h3>
      <p>Beams fire forward by default. Wider arcs cost extra space: {(Object.values(ARCS)).map((a) => `${a.name} ${signed(a.pct)}%`).join(", ")}.</p>
      <h3>Missile racks</h3>
      <p>A missile mount picks how many shots it carries: {MISSILE_RACKS.map((r) => `${r.shots} shots for ${r.space} space`).join(", ")}.</p>
    </div>
  );
}

function WeaponPage({ w }: { w: WeaponDef }) {
  const kindText: Record<WeaponDef["kind"], string> = {
    beam: "Fires every round. Attack against the target's beam defense sets the chance to hit; range lowers both the hit chance and the damage. Shields subtract from every hit.",
    missile: "Launched as a salvo that flies across the field at its own speed. Point defense, anti-missile rockets and jammers can stop it before it lands.",
    torpedo: "Flies like a missile but cannot be shot down, and its launcher needs a round to reload after each shot.",
    bomb: "Only used against colonies whose defenses are down, by fleets set to attack. Kills population and may wreck buildings.",
    spores: "Biological weapon against colonies: kills population directly, ignoring buildings.",
    special: "A special-purpose device with its own effect in battle, described below.",
    bay: "Launches small craft that fly to their targets, attack and return to rearm.",
  };
  return (
    <div className="col">
      <p>{kindText[w.kind]}</p>
      <Facts rows={[
        ["Damage", dmg(w)],
        ["Base space", w.space], ["Base cost", w.cost],
        ...(w.ammo ? [["Shots per battle", w.ammo] as [string, ReactNode]] : []),
        ...(w.speed !== undefined ? [["Speed", speedText(w)] as [string, ReactNode]] : []),
        ...(w.mods.length ? [["Modifications", w.mods.map((m) => WEAPON_MODS_BY_ID[m].name).join(", ")] as [string, ReactNode]] : []),
        ["Requires", <Requires tech={w.requires} />],
      ]} />
      {miniNote}
    </div>
  );
}

function ArmorPage({ id }: { id: string }) {
  const a = ARMORS_BY_ID[id]!;
  return (
    <div className="col">
      <p>Armor is chosen once per design and multiplies the hull's armor and structure. It takes no space and costs nothing.</p>
      <Facts rows={[["Armor grade", `×${a.mult}`], ["Requires", <Requires tech={a.requires} />]]} />
      <h3>Hit points by hull</h3>
      <table className="help-table">
        <thead><tr>{HULLS.map((h) => <th key={h.id}>{h.name}</th>)}</tr></thead>
        <tbody><tr>{HULLS.map((h) => <td key={h.id}>{hullHits(h, a.mult)}</td>)}</tr></tbody>
      </table>
    </div>
  );
}

function ComponentTable<T extends { id: string; name: string; requires: string }>({ items, kind, cols }: {
  items: T[]; kind: string; cols: [string, (x: T) => ReactNode][];
}) {
  return (
    <table className="help-table">
      <thead><tr><th>Name</th>{cols.map(([h]) => <th key={h}>{h}</th>)}<th>Requires</th></tr></thead>
      <tbody>
        {items.map((x) => (
          <tr key={x.id}><td><HelpLink to={`${kind}:${x.id}`} /></td>{cols.map(([h, f]) => <td key={h}>{f(x)}</td>)}<td><Requires tech={x.requires} /></td></tr>
        ))}
      </tbody>
    </table>
  );
}

function ShieldPage({ id }: { id: string }) {
  const s = SHIELDS_BY_ID[id]!;
  return (
    <div className="col">
      <p>
        A shield first takes its class off every hit, then soaks damage from a pool on the side that was hit. Each of
        the four sides holds class × 5 × size class points and recovers part of that every round.
      </p>
      <Facts rows={[["Stops", `${s.absorb} damage per hit`], ["Pool per side", `${s.absorb * 5} × size class`], ["Requires", <Requires tech={s.requires} />]]} />
      <SpaceByHull space={SHIELD_SPACE_BY_HULL} cost={SHIELD_COST_BY_HULL} />
      {miniNote}
    </div>
  );
}

function ComputerPage({ id }: { id: string }) {
  const c = COMPUTERS_BY_ID[id]!;
  return (
    <div className="col">
      <p>The combat computer adds to beam attack, which raises the chance to hit against the target's defense. It takes no space.</p>
      <Facts rows={[["Beam attack", signed(c.attack)], ["Requires", <Requires tech={c.requires} />]]} />
      <SpaceByHull space={HULLS.map(() => 0)} cost={COMPUTER_COST_BY_HULL} />
      {miniNote}
    </div>
  );
}

function SpecialPage({ id }: { id: string }) {
  const s = SPECIALS_BY_ID[id]!;
  return (
    <div className="col">
      <h3>Effects</h3>
      <List items={specialEffects(s.effects)} />
      <Facts rows={[
        ["Requires", <Requires tech={s.requires} />],
        ...(s.excludes?.length ? [["Cannot be combined with", s.excludes.map((x) => SPECIALS_BY_ID[x]?.name ?? x).join(", ")] as [string, ReactNode]] : []),
      ]} />
      <SpaceByHull space={s.space} cost={s.cost} />
      <p className="muted">A design can carry each special system once.</p>
      {miniNote}
    </div>
  );
}

function ModulePage({ id }: { id: keyof typeof MODULES }) {
  const m = MODULES[id];
  const tech = Object.keys(TECHS).find((t) => techUnlocks(t).some((u) => u.kind === "module" && u.id === id)) ?? null;
  const text: Record<keyof typeof MODULES, string> = {
    colony: "Settles a habitable planet: move the ship to the star and press Colonize. The ship is used up.",
    outpost: "Claims any habitable planet as an outpost. Outposts have no population but extend fuel range and count for score. Asteroids and gas giants can't take outposts.",
    transport: "Carries troops to invade enemy colonies once their orbital defenses are down.",
  };
  return (
    <div className="col">
      <p>{text[id]}</p>
      <Facts rows={[
        ["Space", m.space], ["Cost", m.cost], ["Smallest hull", <HelpLink to={`hull:${m.minHull}`} />],
        ...(m.troops ? [["Troops", m.troops] as [string, ReactNode]] : []),
        ["Requires", <Requires tech={tech} />],
      ]} />
    </div>
  );
}

function DrivesPage() {
  return (
    <div className="col">
      <p>
        Fleet speed and combat speed come from the best drive you know; it is not a design choice. Without any
        drive, ships move {fleetSpeed(noTech)} parsec per turn. In battle a ship is fastest with an empty hull and slowest
        when fully loaded; designs fall in between, and every point of combat speed adds 5 to beam defense.
        {TECHS.jumpGate && <> <HelpLink to="tech:jumpGate" /> adds 1 parsec per turn.</>}
      </p>
      <table className="help-table">
        <thead><tr><th>Drive</th><th>Parsecs per turn</th><th>Combat speed, loaded to empty, frigate … doom star</th><th>Tech</th></tr></thead>
        <tbody>{DRIVES.map((d) => <tr key={d.tech}><td>{d.name}</td><td>{d.speed}</td><td>{d.combatFull.map((f, i) => `${f}–${d.combatEmpty[i]}`).join(", ")}</td><td><Requires tech={d.tech} /></td></tr>)}</tbody>
      </table>
      <h3>Fuel range</h3>
      <p>Ships can only fly this far from your nearest colony or outpost. Without fuel cells the range is {fleetRange(noTech)} parsecs.</p>
      <table className="help-table">
        <thead><tr><th>Fuel cells</th><th>Range</th></tr></thead>
        <tbody>{FUEL_RANGES.map((f) => <tr key={f.tech}><td><Requires tech={f.tech} /></td><td>{f.range >= 99 ? "Unlimited" : `${f.range} parsecs`}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- planets

const SIZES = Object.keys(SIZE_FACTOR) as PlanetSize[];
const MINERALS = Object.keys(INDUSTRY_PER_WORKER) as Minerals[];
const STARS = Object.keys(STAR_COLOR_WEIGHTS) as StarColor[];
const share = (weights: Partial<Record<string, number>>, key: string) => {
  const total = Object.values(weights).reduce((s: number, v) => s + (v ?? 0), 0);
  return total > 0 ? (weights[key] ?? 0) / total : 0;
};

function PlanetsPage() {
  return (
    <div className="col">
      <p>
        Climate decides how many people a planet holds per size step and how much food each farmer grows. Hostile
        worlds hold few people. Asteroids and gas giants can't be settled at all, not even by outposts, until an{" "}
        <HelpLink to="project:artificialPlanet" /> turns them into barren planets. Max population is the climate's share of
        the size's full population (tiny 5 to huge 25), rounded, plus race traits, buildings and techs.
      </p>
      <table className="help-table">
        <thead><tr><th>Type</th><th>Climate %</th><th>Food per farmer</th><th>Max pop tiny → huge</th><th>Notes</th></tr></thead>
        <tbody>
          {(Object.keys(CLIMATES) as PlanetType[]).map((t) => {
            const c = CLIMATES[t];
            return (
              <tr key={t}>
                <td><HelpLink to={`climate:${t}`} /></td><td>{c.popPercent}%</td><td>{c.foodPerFarmer}</td>
                <td>{c.habitable ? SIZES.map((s) => climatePopulation(c.popPercent, s)).join(" / ") : "–"}</td>
                <td>{!c.habitable ? "Needs Artificial Planet" : c.hostile ? "Hostile" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClimatePage({ type }: { type: PlanetType }) {
  const c = CLIMATES[type];
  const from = Object.entries(TERRAFORM_STEP).filter(([, to]) => to.includes(type)).map(([f]) => `climate:${f}`);
  const to = TERRAFORM_STEP[type];
  return (
    <div className="col">
      <Facts rows={[
        ["Habitable", c.habitable ? "Yes" : "No: not even outposts, until an Artificial Planet converts it"],
        ["Hostile", c.hostile ? "Yes" : "No"],
        ["Population share", `${c.popPercent}% of a Gaia world`],
        ["Food per farmer", c.foodPerFarmer],
        ...(c.habitable ? [["Max population", SIZES.map((s) => `${words(s)} ${climatePopulation(c.popPercent, s)}`).join(", ")] as [string, ReactNode]] : []),
        ...(to ? [["Terraforms into", <Links ids={to.map((t) => `climate:${t}`)} />] as [string, ReactNode]] : []),
        ["Building upkeep", c.maintenancePenalty ? `+${Math.round(c.maintenancePenalty * 100)}%` : "normal"],
        ...(from.length ? [["Terraformed from", <Links ids={from} />] as [string, ReactNode]] : []),
        ...(type === "terran" ? [["Gaia", <HelpLink to="project:gaiaTransform" />] as [string, ReactNode]] : []),
        ...(!c.habitable ? [["Artificial planet", <HelpLink to="project:artificialPlanet" />] as [string, ReactNode]] : []),
      ]} />
      <h3>Where it is found</h3>
      <table className="help-table">
        <thead><tr>{STARS.map((s) => <th key={s}>{words(s)}</th>)}</tr></thead>
        <tbody><tr>{STARS.map((s) => <td key={s}>{pct(share(PLANET_TYPE_WEIGHTS[s], type))}</td>)}</tr></tbody>
      </table>
      <small className="muted">Share of planets around each star color.</small>
    </div>
  );
}

const raceWithGravity = (trait: RaceTrait | null): RaceDef => ({ ...RACES[0]!, picks: { ...RACES[0]!.picks, traits: trait ? [trait] : [] } });

function PlanetTraitsPage() {
  const natives: [string, RaceTrait | null][] = [["Low-G race", "lowG"], ["Normal race", null], ["High-G race", "highG"]];
  return (
    <div className="col">
      <h3>Size</h3>
      <p>Size sets the population a planet holds and how much polluting industry it absorbs; half the excess, rounded up, is lost unless cleaned up. Nano Disassemblers double the tolerance.</p>
      <table className="help-table">
        <thead><tr><th>Size</th><th>Full population (Gaia)</th><th>Pollution-free industry</th><th>Frequency</th></tr></thead>
        <tbody>{SIZES.map((s) => <tr key={s}><td>{words(s)}</td><td>{SIZE_POP_BASE[s]}</td><td>{POLLUTION_TOLERANCE[s]}</td><td>{pct(share(PLANET_SIZE_WEIGHTS, s))}</td></tr>)}</tbody>
      </table>
      <h3>Minerals</h3>
      <p>Minerals set the base industry of each worker.</p>
      <table className="help-table">
        <thead><tr><th>Minerals</th><th>Industry per worker</th></tr></thead>
        <tbody>{MINERALS.map((m) => <tr key={m}><td>{words(m)}</td><td>{INDUSTRY_PER_WORKER[m]}</td></tr>)}</tbody>
      </table>
      <h3>Gravity</h3>
      <p>Gravity follows from size and minerals. Living away from your home gravity cuts food, industry and research. A <HelpLink to="building:gravityGenerator" /> removes the penalty.</p>
      <table className="help-table">
        <thead><tr><th>Size</th>{MINERALS.map((m) => <th key={m}>{words(m)}</th>)}</tr></thead>
        <tbody>{SIZES.map((s) => <tr key={s}><td>{words(s)}</td>{MINERALS.map((m) => <td key={m}>{gravityOf(s, m)}</td>)}</tr>)}</tbody>
      </table>
      <table className="help-table">
        <thead><tr><th>Output on</th><th>Low gravity</th><th>Normal</th><th>Heavy</th></tr></thead>
        <tbody>
          {natives.map(([label, t]) => (
            <tr key={label}>
              <td>{t ? <HelpLink to={`trait:${t}`}>{label}</HelpLink> : label}</td>
              {(["low", "normal", "heavy"] as const).map((g) => <td key={g}>{pct(gravityMultiplier(raceWithGravity(t), g))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StarsPage() {
  const total = Object.values(STAR_COLOR_WEIGHTS).reduce((s, v) => s + v, 0);
  return (
    <div className="col">
      <p>Star color shapes what orbits it: hot stars skew toward hostile worlds and rich minerals, yellow and orange stars toward temperate ones. Black holes have no planets.</p>
      <table className="help-table">
        <thead><tr><th>Star</th><th>Frequency</th><th>Planets</th><th>Most common planets</th><th>Rich or better minerals</th></tr></thead>
        <tbody>
          {STARS.map((s) => {
            const types = Object.entries(PLANET_TYPE_WEIGHTS[s]).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3);
            const [lo, hi] = PLANETS_PER_STAR[s];
            const rich = share(MINERAL_WEIGHTS_BY_STAR[s], "rich") + share(MINERAL_WEIGHTS_BY_STAR[s], "ultraRich");
            return (
              <tr key={s}>
                <td>{words(s)}</td><td>{pct(STAR_COLOR_WEIGHTS[s] / total)}</td><td>{hi === 0 ? "None" : `${lo}–${hi}`}</td>
                <td>{types.length ? <Links ids={types.map(([t]) => `climate:${t}`)} /> : "–"}</td>
                <td>{hi === 0 ? "–" : pct(rich)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- races

function pickText(r: RaceDef): string[] {
  const out: string[] = [];
  for (const [key, def] of Object.entries(PICK_OPTIONS) as [NumericPick, (typeof PICK_OPTIONS)[NumericPick]][]) {
    const v = r.picks[key];
    if (!v) continue;
    const opt = def.options.find((o) => o.value === v);
    out.push(`${def.label} ${opt?.text ?? signed(v, 1)}`);
  }
  return out;
}

function RacesPage() {
  return (
    <div className="col">
      <p>Every race is a set of picks: bonuses, a government and traits. You can build your own in the race builder (see <HelpLink to="page:racePicks" />).</p>
      <div className="help-races">
        {RACES.map((r) => (
          <HelpLink key={r.id} to={`race:${r.id}`}>
            <span className="help-race">
              <img src={`races/${r.assetKey}.webp`} alt="" width={64} height={64} />
              <span><b>{r.name}</b><br /><small className="muted">{r.archetype}</small></span>
            </span>
          </HelpLink>
        ))}
      </div>
    </div>
  );
}

function RacePage({ race }: { race: RaceDef }) {
  return (
    <div className="col">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <img src={`races/${race.assetKey}.webp`} alt="" width={140} height={140} style={{ borderRadius: 8, objectFit: "cover", background: "#000" }} />
        <p style={{ flex: 1, minWidth: 220 }}>{race.description}</p>
      </div>
      <Facts rows={[
        ["Government", <HelpLink to={`government:${race.picks.government}`} />],
        ["Bonuses", pickText(race).join(", ") || "None"],
        ["Traits", race.picks.traits.length ? <Links ids={race.picks.traits.map((t) => `trait:${t}`)} /> : "None"],
      ]} />
    </div>
  );
}

function RacePicksPage() {
  return (
    <div className="col">
      <p>
        A custom race has {CUSTOM_RACE_POINTS} points to spend. Drawbacks give points back, up to {MAX_NEGATIVE_POINTS} in
        total. The default for every bonus is free.
      </p>
      <h3>Bonuses</h3>
      <table className="help-table">
        <thead><tr><th>Pick</th><th>Options (cost)</th></tr></thead>
        <tbody>
          {Object.values(PICK_OPTIONS).map((p) => (
            <tr key={p.label}><td>{p.label}</td><td>{p.options.map((o) => `${o.text} (${signed(o.cost)})`).join(" · ")}</td></tr>
          ))}
        </tbody>
      </table>
      <h3>Government</h3>
      <table className="help-table">
        <tbody>{Object.entries(GOVERNMENT_COSTS).map(([g, c]) => <tr key={g}><td><HelpLink to={`government:${g}`} /></td><td>{signed(c)} points</td></tr>)}</tbody>
      </table>
      <h3>Traits</h3>
      <table className="help-table">
        <tbody>
          {(Object.entries(TRAIT_COSTS) as [RaceTrait, { cost: number; text: string }][]).map(([t, d]) => (
            <tr key={t}><td><HelpLink to={`trait:${t}`} /></td><td>{signed(d.cost)}</td><td>{d.text}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Can't be combined: {EXCLUSIVE_TRAITS.map((g) => g.map(traitName).join(" / ")).join("; ")}.</p>
    </div>
  );
}

function TraitPage({ trait }: { trait: RaceTrait }) {
  const d = TRAIT_COSTS[trait];
  const races = RACES.filter((r) => r.picks.traits.includes(trait));
  const excl = EXCLUSIVE_TRAITS.find((g) => g.includes(trait))?.filter((t) => t !== trait) ?? [];
  return (
    <div className="col">
      <p>{d ? d.text : "A trait of built-in races; the race builder doesn't offer it."}</p>
      <Facts rows={[
        ["Race builder cost", d ? `${signed(d.cost)} points` : "Not available"],
        ...(excl.length ? [["Excludes", <Links ids={excl.map((t) => `trait:${t}`)} />] as [string, ReactNode]] : []),
        ["Races with it", races.length ? <Links ids={races.map((r) => `race:${r.id}`)} /> : "None of the built-in races"],
      ]} />
    </div>
  );
}

function govRows(g: GovernmentDef): [string, ReactNode][] {
  const m = (v: number) => (v === 1 ? "normal" : `${signed(Math.round((v - 1) * 100))}%`);
  return [
    ["Food", m(g.foodMult)], ["Industry", m(g.industryMult)], ["Research", m(g.researchMult)], ["BC income", m(g.bcMult)],
    ["Ship cost", m(g.shipCostMult)], ["Morale", g.morale ? `${signed(g.morale)}%` : "normal"],
    ["Without marine barracks", g.ungarrisonedPenalty ? `−${g.ungarrisonedPenalty}% morale` : "no penalty"],
    ["Spy defense", signed(g.security)],
  ];
}

function GovernmentsPage() {
  const ids = Object.keys(GOVERNMENTS) as (keyof typeof GOVERNMENTS)[];
  return (
    <div className="col">
      <p>
        Every race starts with a basic government. The <HelpLink to="tier:advancedGovernments" /> field offers the
        advanced form of your own government; researching it upgrades your government automatically.
      </p>
      <table className="help-table">
        <thead><tr><th /> {ids.map((id) => <th key={id}><HelpLink to={`government:${id}`} /></th>)}</tr></thead>
        <tbody>
          {govRows(GOVERNMENTS.feudal).map(([label], i) => (
            <tr key={label}><td>{label}</td>{ids.map((id) => <td key={id}>{govRows(GOVERNMENTS[id])[i]![1]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GovernmentPage({ id }: { id: keyof typeof GOVERNMENTS }) {
  const g = GOVERNMENTS[id];
  const basic = (Object.keys(GOVERNMENTS) as (keyof typeof GOVERNMENTS)[]).find((k) => GOVERNMENTS[k].advanced === id);
  const races = RACES.filter((r) => r.picks.government === id);
  return (
    <div className="col">
      <Facts rows={[
        ...govRows(g),
        ...(g.advanced ? [["Advanced form", <HelpLink to={`government:${g.advanced}`} />] as [string, ReactNode]] : []),
        ...(basic ? [["Advanced form of", <HelpLink to={`government:${basic}`} />] as [string, ReactNode]] : []),
        ...(races.length ? [["Races", <Links ids={races.map((r) => `race:${r.id}`)} />] as [string, ReactNode]] : []),
      ]} />
    </div>
  );
}

// ---------------------------------------------------------------- monsters

const npcWeapon = (id: string) => ALL_WEAPONS[id] ?? NPC_WEAPONS.find((w) => w.id === id);

/** "12× Particle Beam (Heavy Mount)". */
const mountLabel = (m: WeaponMount) =>
  `${m.count}× ${npcWeapon(m.weaponId)?.name ?? m.weaponId}${m.mods?.length ? ` (${m.mods.map((id) => WEAPON_MODS_BY_ID[id]?.name ?? id).join(", ")})` : ""}`;

const LEVELS: Difficulty[] = ["tutor", "easy", "average", "hard", "impossible"];

const homeQuota = RAIDER_HULLS.filter((h) => RAID_HOME_QUOTA[h] > 0).map((h) => `${RAID_HOME_QUOTA[h]} ${RAIDER_SHIP_NAMES[h]}s`).join(", ");

function MonsterRow({ d, label }: { d: ShipDesign; label?: string }) {
  const f = d.fixed!;
  return (
    <tr>
      <td><HelpLink to={`monster:${d.id}`} />{label && <small className="muted"> {label}</small>}</td><td>{fmt(f.hits)}</td><td>{fmt(f.armor ?? 0)}</td><td>{f.attack}</td><td>{f.defense}</td><td>{f.shield}</td><td>{f.combatSpeed}</td>
      <td>{f.weapons.map(mountLabel).join(", ")}</td>
    </tr>
  );
}

const monsterHead = <thead><tr><th>Name</th><th>Structure</th><th>Armor</th><th>Attack</th><th>Defense</th><th>Shield</th><th>Speed</th><th>Weapons</th></tr></thead>;

function MonstersPage() {
  return (
    <div className="col">
      <p>
        Space monsters guard rich systems and attack any ship that enters; they never leave their lair. The deeper
        into the galaxy, the tougher the guard: {LAIR_MONSTERS.map((id) => MONSTER_DESIGNS.find((d) => d.id === id)?.name ?? id).join(", ")}.
        The guardian holds Orion, the best system in the galaxy; whoever destroys it salvages the <HelpLink to="weapon:deathRay" /> and up to three more random xenon technologies, and the last of the elders joins them if a captain's post is free.
      </p>
      <table className="help-table">{monsterHead}<tbody>{MONSTER_DESIGNS.map((d) => <MonsterRow key={d.id} d={d} />)}</tbody></table>
      <h3>Raiders</h3>
      <p>
        The Vexari raiders live in a pocket dimension outside the galaxy. They leave the galaxy alone for the first{" "}
        {RAID_GRACE_TURNS.average} turns ({RAID_GRACE_TURNS.preWarp} when starting pre-warp, none when starting advanced).
        After that they have two build budgets, one for raid ships and one for the fleet guarding their home. Every{" "}
        {RAID_BUDGET_PERIOD} turns each budget gains 1 point, then 2, then 3 and so on ({RAID_BUDGET_MULT.hard / 100}× as much on Hard
        and {RAID_BUDGET_MULT.impossible / 100}× on Impossible, rounded up). Once the home fleet is complete
        ({homeQuota}), the raid budget gets both shares.
      </p>
      <p>
        Each budget buys ships smallest hull first: again and again, the smallest hull that is affordable, under its cap
        and still in its time window. Frigates are only bought for the first {RAID_FRIGATE_WINDOW.average} turns after the grace
        period ({RAID_FRIGATE_WINDOW.hard} on Hard, {RAID_FRIGATE_WINDOW.impossible} on Impossible, never in games started at the
        advanced tech level), destroyers for the first {RAID_DESTROYER_WINDOW.average} ({RAID_DESTROYER_WINDOW.hard} on Hard,{" "}
        {RAID_DESTROYER_WINDOW.impossible} on Impossible). Once the raid pool has reached its cap of frigates, destroyers or cruisers,
        lost ones are never replaced, and three cruisers at home end cruiser building for raids too. On Hard and Impossible,
        buying the first titan cuts every price to {RAID_TITAN_DISCOUNT.pct}% for the rest of the game
        ({RAIDER_HULLS.map((h) => Math.floor((RAIDER_HULL_COST[h] * RAID_TITAN_DISCOUNT.pct) / 100)).join(", ")}).
      </p>
      <table className="help-table">
        <thead><tr><th>Ship</th><th>Hull</th><th>Cost</th><th>Raid pool cap</th><th>Home fleet</th></tr></thead>
        <tbody>
          {RAIDER_HULLS.map((h) => (
            <tr key={h}>
              <td>{RAIDER_SHIP_NAMES[h]}</td><td><HelpLink to={`hull:${h}`} /></td><td>{RAIDER_HULL_COST[h]}</td><td>{RAID_FLEET_CAP[h]}</td>
              <td>{h === "titan" ? `${RAID_HOME_QUOTA[h]} (always at least ${RAID_HOME_MIN_TITANS})` : RAID_HOME_QUOTA[h] || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        A raid can only set off while {RAID_LAUNCH_VALUE_MULT}× the value of the raid pool is at least the value of the home
        fleet plus both unspent budgets. Each such turn with raid ships waiting raises a counter by 1, and the raid sets off
        with a chance of (counter + 1) in {RAID_LAUNCH_ROLL}; the counter starts again from 0 after a raid. A raid takes
        up to {RAID_MAX_SHIPS} ships from the pool, largest hulls first.
      </p>
      <p>
        A raid goes for a big empire: the empire with the fewest people is left alone, and the others are weighted by the square of
        how much more population they have than it. Lucky empires count a third of their population. Human players count{" "}
        {pct(RAID_HUMAN_POP_MULT.tutor)} on Tutor, {pct(RAID_HUMAN_POP_MULT.easy)} on Easy, {RAID_HUMAN_POP_MULT.hard}× on Hard
        and {RAID_HUMAN_POP_MULT.impossible}× on Impossible. The raid strikes a random system with one of that empire's colonies
        (outposts don't count) and fights everything there. If the defenses fall, the raiders bomb the colony with their
        neutronium bombs like any bombardment (every {BOMB_DAMAGE_PER_HIT} damage kills a colonist or troop or wrecks a
        building); a colony left with nobody is destroyed. Raiders never invade. At the end of the turn the survivors go home
        and can raid again; only the ships destroyed are lost. Ships the home fleet loses are replaced from the raid pool.
      </p>
      <p>
        Their ships never change: one design per hull, the same all game, with no shield, a{" "}
        <HelpLink to="computer:moleculartronicComputer" />, <HelpLink to="armor:xentroniumArmor" /> armor, the Hyper Drive,
        a <HelpLink to="special:damperField" /> and a <HelpLink to="special:quantumDetonator" />. Only the jammer depends on the
        difficulty level. Raid crews are {crewName(2)}; the citadel's crew is {crewName(RAIDER_CITADEL.crewLevel)}.
      </p>
      <table className="help-table">
        <thead><tr><th>Ship</th><th>Weapons</th><th>Other specials</th><th>Jammer (Tutor, Easy, Average, Hard, Impossible)</th></tr></thead>
        <tbody>
          {RAIDER_HULLS.map((h) => {
            const spec = RAIDER_DESIGNS[h];
            return (
              <tr key={h}>
                <td>{RAIDER_SHIP_NAMES[h]}</td>
                <td>{spec.weapons.map((w) => mountLabel(w) + (w.arc === "full" ? ", all round" : "")).join("; ")}</td>
                <td>{spec.specials.map((id, j) => <span key={id}>{j > 0 && ", "}<HelpLink to={`special:${id}`} /></span>)}{spec.specials.length === 0 && "–"}</td>
                <td>{LEVELS.map((d) => (spec.jammer[d] ? SPECIALS_BY_ID[spec.jammer[d]!]?.name : "none")).join(", ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Striking back</h3>
      <p>
        A <HelpLink to="project:dimensionalPortal" /> is built at one colony. Fleets in that system can cross to Vex Prime in a
        single turn. If they don't destroy everything there, the survivors come back through the nearest of your portals.
        Vex Prime is guarded by the home fleet, at least one {RAIDER_SHIP_NAMES.titan}, and the{" "}
        <HelpLink to={`monster:${RAIDER_CITADEL_ID}`} />: {fmt(RAIDER_CITADEL.armor)} armor, {fmt(RAIDER_CITADEL.structure)} structure,
        no shield, rebuilt fresh for every battle. Destroying all of it wipes the raiders out. Every other empire then capitulates and you win
        the game, with the biggest score bonus there is. Captured raider ships can be scrapped: each one has
        a {pct(SCRAP_TECH_CHANCE)} chance to teach one of its technologies. That is the only way to learn their xenon technology.
      </p>
      <table className="help-table">{monsterHead}<tbody><MonsterRow d={citadelDesign()} /></tbody></table>
      <h3>Monster weapons</h3>
      <table className="help-table">
        <thead><tr><th>Weapon</th><th>Kind</th><th>Damage</th><th>Shots</th><th /></tr></thead>
        <tbody>{[...NPC_WEAPONS, WEAPONS_BY_ID.deathRay!].filter(Boolean).map((w) => (
          <tr key={w.id}><td>{WEAPONS_BY_ID[w.id] ? <HelpLink to={`weapon:${w.id}`} /> : w.name}</td><td>{words(w.kind)}</td>
            <td>{dmg(w)}</td><td>{w.ammo ?? "–"}</td><td /></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function MonsterPage({ id }: { id: string }) {
  const d = [...MONSTER_DESIGNS, citadelDesign()].find((x) => x.id === id)!;
  const f = d.fixed!;
  return (
    <div className="col">
      <Facts rows={[
        ["Structure", fmt(f.hits)], ["Armor", fmt(f.armor ?? 0)], ["Attack", f.attack], ["Defense", f.defense], ["Shield", `${f.shield} per hit`], ["Combat speed", f.combatSpeed],
        ["Weapons", <List items={f.weapons.map((w) => {
          const wd = npcWeapon(w.weaponId);
          const label = mountLabel(w);
          return wd && WEAPONS_BY_ID[wd.id] ? <HelpLink to={`weapon:${wd.id}`}>{label}</HelpLink> : <>{label}{wd && <small className="muted"> ({dmg(wd)} damage)</small>}</>;
        })} />],
        ...(d.specials.length > 0 ? [["Specials", <Links ids={d.specials.map((s) => `special:${s}`)} />] as [string, ReactNode]] : []),
        ...(f.crew !== undefined ? [["Crew", crewName(f.crew)] as [string, ReactNode]] : []),
      ]} />
      <p className="muted">See <HelpLink to="page:monsters" /> for where they appear.</p>
    </div>
  );
}

// ---------------------------------------------------------------- registry

const PAGES: Record<string, () => ReactNode> = {
  techTree: () => <TechTreePage />,
  techList: () => <TechListPage />,
  buildings: () => <BuildingsPage />,
  projects: () => <ProjectsPage />,
  hulls: () => <HullsPage />,
  weapons: () => <WeaponsPage />,
  armor: () => (
    <div className="col">
      <p>Armor grade multiplies the hull's armor and structure. Armor is free.</p>
      <ComponentTable items={ARMORS} kind="armor" cols={[["Grade", (a) => `×${a.mult}`], ["Battleship hit points", (a) => hullHits(HULLS_BY_ID.battleship, a.mult)]]} />
    </div>
  ),
  shields: () => (
    <div className="col">
      <p>Shields take space by hull size, stop their class from every hit and hold a pool of points on each side of the ship.</p>
      <ComponentTable items={SHIELDS} kind="shield" cols={[["Stops", (s) => `${s.absorb} per hit`], ["Pool per side", (s) => `${s.absorb * 5} × size class`]]} />
    </div>
  ),
  computers: () => (
    <div className="col">
      <p>The combat computer raises beam attack.</p>
      <ComponentTable items={COMPUTERS} kind="computer" cols={[["Attack", (c) => signed(c.attack)]]} />
    </div>
  ),
  specials: () => (
    <div className="col">
      <p>Special systems take a set amount of space that grows with the hull.</p>
      <ComponentTable items={SPECIALS} kind="special" cols={[["Effect", (s) => specialEffects(s.effects).join(", ")], ["Space by hull", (s) => s.space.join("/")]]} />
    </div>
  ),
  modules: () => (
    <div className="col">
      <p>A module turns a hull into a colony ship, outpost ship or troop transport.</p>
      <table className="help-table">
        <thead><tr><th>Module</th><th>Space</th><th>Cost</th><th>Smallest hull</th></tr></thead>
        <tbody>{(Object.keys(MODULES) as (keyof typeof MODULES)[]).map((id) => (
          <tr key={id}><td><HelpLink to={`module:${id}`} /></td><td>{MODULES[id].space}</td><td>{MODULES[id].cost}</td><td><HelpLink to={`hull:${MODULES[id].minHull}`} /></td></tr>
        ))}</tbody>
      </table>
    </div>
  ),
  drives: () => <DrivesPage />,
  planets: () => <PlanetsPage />,
  planetTraits: () => <PlanetTraitsPage />,
  stars: () => <StarsPage />,
  races: () => <RacesPage />,
  racePicks: () => <RacePicksPage />,
  governments: () => <GovernmentsPage />,
  monsters: () => <MonstersPage />,
};

/** Every page id used by `page:` entries, for tests. */
export const PAGE_IDS = Object.keys(PAGES);
