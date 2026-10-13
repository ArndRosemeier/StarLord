import { useState } from "react";
import {
  exterminateProblem, buildingScrapRefund, scrapBuildingProblem,
  BUILDINGS_BY_ID, MAX_QUEUE, PLACED_PROJECTS, PROJECTS_BY_ID, baseTargets, availableBuildings, availableDesigns, availableProjects, buyCost,
  FREIGHTERS, androids, colonyOutput, findDesign, foodPlan, freeFreighters, isContinuous, itemCost, population,
  type BuildItem, type Colony,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { climateName, fmt, itemName, signed, words } from "../ui/format";
import { PlanetIcon, PlanetOrb, viewStarOfColony } from "../ui/panels";
import { Icon } from "../ui/fx";
import { Tip, TipBody } from "../ui/Tip";
import { PlanetFacts, buildingScrapTip, buildingTip, moraleTip, projectTip, tradeGoodsBC, tradeGoodsTip } from "../ui/explain";
import { designTip } from "./designTips";
import { BaseChoices } from "./BasePrompt";
import { JobRows } from "./JobRows";
import { SortTh, sortRows, useSort, type SortValue } from "../ui/sort";

type ColonySortKey = "name" | "pop" | "food" | "industry" | "research" | "building";

export function ColoniesScreen({ onShowStar, initialColony }: { onShowStar: (starId: string) => void; initialColony?: string | null }) {
  const { view, me } = useGame();
  const colonies = Object.values(view.colonies).filter((c) => c.ownerId === me.id);
  const [selected, setSelected] = useState<string | null>(
    initialColony && view.colonies[initialColony]?.ownerId === me.id ? initialColony : colonies[0]?.id ?? null,
  );
  const colony = selected ? view.colonies[selected] : undefined;
  const { sort, toggle } = useSort<ColonySortKey>("name", "asc", (k) => (k === "name" || k === "building" ? "asc" : "desc"));
  const rows = colonies.map((c) => {
    const o = colonyOutput(view, c);
    const head = c.queue[0];
    const cost = head ? itemCost(view, me.id, head, c) : 0;
    const turns = head && Number.isFinite(cost) && o.industry > 0 ? Math.ceil((cost - c.progress) / o.industry) : null;
    return { c, o, head, turns };
  });
  const sorted = sortRows(rows, sort, ({ c, o, head }, k): SortValue => {
    switch (k) {
      case "name": return c.name;
      case "pop": return c.outpost ? null : population(c);
      case "food": return c.outpost ? null : o.foodNet;
      case "industry": return c.outpost ? null : o.industry;
      case "research": return c.outpost ? null : o.research;
      case "building": return head ? itemName(view, head) : c.outpost ? null : "";
    }
  });

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(420px, 1.1fr) minmax(380px, 1fr)" }}>
      <div className="panel scroll">
        <h2>Colonies</h2>
        <table>
          <thead>
            <tr>
              <SortTh k="name" sort={sort} onSort={toggle}>Colony</SortTh>
              <SortTh k="pop" sort={sort} onSort={toggle}>Pop</SortTh>
              <SortTh k="food" sort={sort} onSort={toggle} className="food">Food</SortTh>
              <SortTh k="industry" sort={sort} onSort={toggle} className="industry">Ind</SortTh>
              <SortTh k="research" sort={sort} onSort={toggle} className="research">Res</SortTh>
              <SortTh k="building" sort={sort} onSort={toggle}>Building</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ c, o, head, turns }) => (
              <tr key={c.id} className={`clickable${c.id === selected ? " selected" : ""}`} onClick={() => setSelected(c.id)}>
                <td>
                  <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    {view.planets[c.planetId] && <PlanetIcon planet={view.planets[c.planetId]!} size={20} />}
                    {c.name}{c.outpost && <small className="muted"> outpost</small>}
                  </span>
                </td>
                <td>{c.outpost ? "–" : `${population(c)}/${o.maxPopulation}`}</td>
                <td className={o.foodNet < 0 ? "bad" : ""}>{c.outpost ? "" : signed(o.foodNet)}</td>
                <td>{c.outpost ? "" : fmt(o.industry)}</td>
                <td>{c.outpost ? "" : fmt(o.research)}</td>
                <td className="muted">{head ? `${itemName(view, head)}${turns !== null && !isContinuous(head) ? ` (${Math.max(1, turns)})` : ""}` : c.outpost ? "" : <span className="warn">Trade Goods</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {colony && <ColonyDetail key={colony.id} colony={colony} onShowStar={onShowStar} />}
    </div>
  );
}

/**
 * The colony's buildings as chips. Picking one opens a confirm step that
 * shows the refund, the upkeep saved and the effect lost before scrapping it.
 */
function BuildingList({ colony }: { colony: Colony }) {
  const { session, view, me, readOnly } = useGame();
  const [picked, setPicked] = useState<string | null>(null);
  const target = picked && colony.buildings.includes(picked) ? picked : null;
  const why = target ? scrapBuildingProblem(view, me.id, colony.id, target) : null;
  return (
    <>
      <div className="row">
        {colony.buildings.length === 0 && <span className="muted">None</span>}
        {colony.buildings.map((b) => (
          <Tip key={b} card={BUILDINGS_BY_ID[b] ? () => buildingTip(b) : null}>
            <span
              className={`chip${readOnly ? "" : " pickable"}${b === target ? " active" : ""}`}
              role={readOnly ? undefined : "button"}
              tabIndex={readOnly ? undefined : 0}
              style={readOnly ? undefined : { cursor: "pointer" }}
              onClick={readOnly ? undefined : () => setPicked(b === target ? null : b)}
              onKeyDown={readOnly ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(b === target ? null : b); } }}
            >
              {BUILDINGS_BY_ID[b]?.name ?? b}
            </span>
          </Tip>
        ))}
      </div>
      {!readOnly && colony.buildings.length > 0 && !target && <small className="muted">Click a building to scrap it.</small>}
      {target && BUILDINGS_BY_ID[target] && (
        <div className="panel col" style={{ gap: 6 }}>
          <TipBody card={buildingScrapTip(target)} />
          {why && <div className="bad">{why[0]!.toUpperCase() + why.slice(1)}.</div>}
          <div className="row">
            <button className="small danger" disabled={!!why} onClick={() => {
              session.issue({ type: "scrapBuilding", colonyId: colony.id, buildingId: target });
              setPicked(null);
            }}>
              Scrap for {buildingScrapRefund(target)} BC
            </button>
            <button className="small" onClick={() => setPicked(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

/** One colony's jobs, output, buildings and production queue; also shown inside the 3D system view. */
export function ColonyDetail({ colony, onShowStar }: { colony: Colony; onShowStar?: (starId: string) => void }) {
  const { session, view, me, readOnly } = useGame();
  const planet = view.planets[colony.planetId]!;
  const star = viewStarOfColony(view, colony.id);
  const o = colonyOutput(view, colony);
  const food = foodPlan(view, me.id);
  const shortfall = food.shortfall[colony.id] ?? 0;
  const andr = androids(colony);
  const idle = freeFreighters(view, me.id);
  const sameRace = Object.values(view.colonies).filter(
    (c) => c.ownerId === me.id && c.id !== colony.id && !c.outpost && c.raceId === colony.raceId,
  );
  const setQueue = (queue: BuildItem[]) => session.issue({ type: "setQueue", colonyId: colony.id, queue });
  const queuedBuildings = new Set(colony.queue.flatMap((q) => (q.kind === "building" ? [q.id] : [])));
  const buildings = availableBuildings(view, me.id, colony).filter((b) => !queuedBuildings.has(b));
  const designs = availableDesigns(view, me.id);
  const projects = availableProjects(view, me.id, colony);
  const head = colony.queue[0];
  const headCost = head ? itemCost(view, me.id, head, colony) : Infinity;
  const price = buyCost(view, colony);

  return (
    <div className="col">
      <div className="panel col">
        <div className="colony-hero">
          <PlanetOrb planet={planet} size={124} populated={!colony.outpost} />
          <div className="col" style={{ gap: 4 }}>
            <div className="row">
              <h2 style={{ margin: 0 }}>{colony.name}</h2>
              {star && onShowStar && <button className="small" onClick={() => onShowStar(star.id)}>Show on map</button>}
            </div>
            <div className="muted">
              <PlanetFacts planet={planet} raceId={colony.raceId} />
            </div>
          </div>
        </div>
        {!colony.outpost && (
          <>
            <table>
              <tbody>
                <tr><td><span className="stat-label"><Icon name="population" />Population</span></td><td>{population(colony)} / {o.maxPopulation} <small className="muted">({o.growthK >= 0 ? "+" : ""}{fmt(o.growthK)}k per turn, {fmt(colony.growthK)}k toward next)</small>
                  {o.androids > 0 && <div><small className="muted">Androids: {andr.farmers} farming, {andr.workers} working, {andr.scientists} researching</small></div>}
                  {o.aliens > 0 && <div><small className="bad">{o.aliens} not yet assimilated: they work at half rate and may revolt</small></div>}
                  {(o.aliens > 0 || (colony.natives ?? 0) > 0) && (() => {
                    const why = exterminateProblem(view, me.id, colony.id);
                    return (
                      <div><button className="small danger" disabled={readOnly || !!why} title={why ?? "Kill every alien and native here. Other empires will hate you for it."}
                        onClick={() => { if (confirm(`Exterminate the alien population of ${colony.name}?`)) session.issue({ type: "exterminate", colonyId: colony.id }); }}>
                        Exterminate aliens</button></div>
                    );
                  })()}
                </td></tr>
                <tr><td className="food"><span className="stat-label"><Icon name="food" />Food</span></td><td>{fmt(o.foodProduced, 1)} produced, {fmt(o.foodEaten)} eaten <b className={o.foodNet < 0 ? "bad" : "good"}>{signed(o.foodNet, 1)}</b>
                  {o.foodReplicated > 0 && <small className="muted"> ({fmt(o.foodReplicated, 1)} replicated)</small>}
                  {o.foodNet < 0 && (shortfall > 0
                    ? <div><small className="bad">Short by {fmt(shortfall, 1)}: not enough freighters{o.blockaded ? " (blockaded)" : ""}, the colony starves</small></div>
                    : <div><small className="muted">Imported by freighter</small></div>)}
                </td></tr>
                <tr><td className="industry"><span className="stat-label"><Icon name="industry" />Industry</span></td><td>{fmt(o.industryGross, 1)} gross, {fmt(o.pollution, 1)} pollution, {fmt(o.taxes, 1)} taxed <b>{fmt(o.industry, 1)}</b></td></tr>
                <tr><td className="research"><span className="stat-label"><Icon name="research" />Research</span></td><td>{fmt(o.research, 1)}</td></tr>
                <tr><td className="bc"><span className="stat-label"><Icon name="bc" />BC</span></td><td>{signed(o.bc, 1)} income, {fmt(o.maintenance, 1)} upkeep</td></tr>
                <tr><td>Morale</td><td className={o.morale < 0 ? "bad" : o.morale > 0 ? "good" : ""}><Tip card={() => moraleTip(view, colony)}><span className="explained">{signed(o.morale)}%</span></Tip>{o.blockaded && <span className="bad"> · blockaded, production halved</span>}</td></tr>
                <tr><td>Troops</td><td>{fmt(o.troops)}</td></tr>
              </tbody>
            </table>
            <h4>Jobs</h4>
            <JobRows colony={colony} />
          </>
        )}
        {!colony.outpost && sameRace.length > 0 && population(colony) > 1 && (
          <div className="row">
            <span>Move a colonist to</span>
            <select disabled={readOnly || idle < FREIGHTERS.perColonist} value="" onChange={(e) => {
              if (e.target.value) session.issue({ type: "moveColonists", fromColonyId: colony.id, toColonyId: e.target.value, count: 1 });
            }}>
              <option value="">…</option>
              {sameRace.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <small className="muted">needs {FREIGHTERS.perColonist} idle freighters ({idle} idle)</small>
          </div>
        )}
        <h4>Buildings</h4>
        <BuildingList key={colony.id} colony={colony} />
      </div>

      {(colony.readyBases?.length ?? 0) > 0 && (
        <div className="panel col">
          <BaseChoices colony={colony} />
        </div>
      )}

      {!colony.outpost && (
        <div className="panel col">
          <div className="row">
            <h3 style={{ margin: 0 }}>Production</h3>
            <span className="spacer" />
            {head && Number.isFinite(headCost) && (
              <button disabled={readOnly || me.bc < price} onClick={() => session.issue({ type: "buy", colonyId: colony.id })}>
                Buy now for {fmt(price)} BC
              </button>
            )}
          </div>
          {colony.queue.length === 0 && (
            <Tip card={() => tradeGoodsTip(colony.raceId, o.industry)}>
              <div className="muted">Nothing queued: the industry goes to Trade Goods, +{fmt(tradeGoodsBC(colony.raceId, o.industry))} BC a turn.</div>
            </Tip>
          )}
          {colony.queue.map((item, i) => {
            const cost = itemCost(view, me.id, item, colony);
            return (
              <div className="row" key={i}>
                <span style={{ width: 18 }} className="muted">{i + 1}.</span>
                <span style={{ flex: 1 }}>
                  {itemName(view, item)}
                  {(item.kind === "ship" || item.kind === "project") && item.repeat && <small className="muted"> · repeat</small>}
                  {i === 0 && Number.isFinite(cost) && (
                    <div className="bar" style={{ marginTop: 3 }}><div style={{ width: `${Math.min(100, (colony.progress / cost) * 100)}%` }} /></div>
                  )}
                </span>
                <small className="muted">
                  {Number.isFinite(cost) ? `${fmt(i === 0 ? colony.progress : 0)}/${fmt(cost)}` : "ongoing"}
                </small>
                {(item.kind === "ship" || (item.kind === "project" && Number.isFinite(cost))) && (
                  <button className={item.repeat ? "small active" : "small"} disabled={readOnly} aria-pressed={!!item.repeat}
                    title={item.repeat
                      ? "Repeat build is on: this is built again every time it finishes, until you remove it or the rules allow no more of it. Items below wait. Click to build it only once."
                      : "Repeat build: build this again every time it finishes, until you remove it or the rules allow no more of it. Items below wait while it repeats."}
                    onClick={() => setQueue(colony.queue.map((q, j) => (j === i && (q.kind === "ship" || q.kind === "project") ? { ...q, repeat: !q.repeat } : q)))}>⟳</button>
                )}
                <button className="small" disabled={readOnly || i === 0} onClick={() => {
                  const q = [...colony.queue];
                  [q[i - 1], q[i]] = [q[i]!, q[i - 1]!];
                  setQueue(q);
                }}>↑</button>
                <button className="small" disabled={readOnly} onClick={() => setQueue(colony.queue.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}
          {!readOnly && colony.queue.length < MAX_QUEUE && (
            <AddToQueue
              onAdd={(item) => setQueue([...colony.queue, item])}
              colony={colony}
              industry={o.industry}
              buildings={buildings}
              designs={designs}
              projects={projects}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AddToQueue({ onAdd, buildings, designs, projects, colony, industry }: {
  onAdd: (item: BuildItem) => void;
  colony: Colony;
  industry: number;
  buildings: string[];
  designs: string[];
  projects: string[];
}) {
  const { view, me } = useGame();
  return (
    <div className="col" style={{ gap: 6 }}>
      <h4>Add to queue</h4>
      <div className="row" style={{ gap: 4 }}>
        {buildings.map((b) => {
          const def = BUILDINGS_BY_ID[b]!;
          return (
            <Tip key={b} card={() => buildingTip(b)}>
              <button className="small" onClick={() => onAdd({ kind: "building", id: b })}>
                {def.name} <span className="muted">{def.cost}</span>
              </button>
            </Tip>
          );
        })}
      </div>
      <div className="row" style={{ gap: 4 }}>
        {designs.map((d) => {
          const design = findDesign(me, d)!;
          return (
            <Tip key={d} card={() => designTip(me, design)}>
              <button className="small" onClick={() => onAdd({ kind: "ship", designId: d })}>
                ⛭ {design.name} <span className="muted">{fmt(itemCost(view, me.id, { kind: "ship", designId: d }))}</span>
              </button>
            </Tip>
          );
        })}
      </div>
      <div className="row" style={{ gap: 4 }}>
        {projects.map((p) => (
          <Tip key={p} card={() => projectTip(p, colony, view.planets[colony.planetId]!, industry, PLACED_PROJECTS[p] ? baseTargets(view, colony, p) : undefined)}>
            <button className="small" onClick={() => onAdd({ kind: "project", id: p })}>
              {PROJECTS_BY_ID[p]?.name}
            </button>
          </Tip>
        ))}
        <Tip card={() => tradeGoodsTip(colony.raceId, industry)}>
          <button className="small" onClick={() => onAdd({ kind: "tradeGoods" })}>Trade Goods</button>
        </Tip>
      </div>
    </div>
  );
}
