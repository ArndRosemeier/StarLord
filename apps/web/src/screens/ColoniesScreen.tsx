import { useState } from "react";
import {
  exterminateProblem,
  BUILDINGS_BY_ID, MAX_QUEUE, PROJECTS_BY_ID, availableBuildings, availableDesigns, availableProjects, buyCost,
  FREIGHTERS, androids, colonyOutput, findDesign, foodPlan, freeFreighters, isContinuous, itemCost, population,
  type BuildItem, type Colony,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { climateName, fmt, itemName, signed, words } from "../ui/format";
import { PlanetIcon, PlanetOrb, viewStarOfColony } from "../ui/panels";
import { Icon } from "../ui/fx";

export function ColoniesScreen({ onShowStar }: { onShowStar: (starId: string) => void }) {
  const { view, me } = useGame();
  const colonies = Object.values(view.colonies).filter((c) => c.ownerId === me.id);
  const [selected, setSelected] = useState<string | null>(colonies[0]?.id ?? null);
  const colony = selected ? view.colonies[selected] : undefined;

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(420px, 1.1fr) minmax(380px, 1fr)" }}>
      <div className="panel scroll">
        <h2>Colonies</h2>
        <table>
          <thead>
            <tr><th>Colony</th><th>Pop</th><th className="food">Food</th><th className="industry">Ind</th><th className="research">Res</th><th>Building</th></tr>
          </thead>
          <tbody>
            {colonies.map((c) => {
              const o = colonyOutput(view, c);
              const head = c.queue[0];
              const cost = head ? itemCost(view, me.id, head, c) : 0;
              const turns = head && Number.isFinite(cost) && o.industry > 0 ? Math.ceil((cost - c.progress) / o.industry) : null;
              return (
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
                  <td className="muted">{head ? `${itemName(view, head)}${turns !== null && !isContinuous(head) ? ` (${Math.max(1, turns)})` : ""}` : c.outpost ? "" : <span className="warn">idle</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {colony && <ColonyDetail key={colony.id} colony={colony} onShowStar={onShowStar} />}
    </div>
  );
}

function ColonyDetail({ colony, onShowStar }: { colony: Colony; onShowStar: (starId: string) => void }) {
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
  const jobs = { farmers: colony.farmers, workers: colony.workers, scientists: colony.scientists };

  const move = (to: keyof typeof jobs, delta: 1 | -1) => {
    const next = { ...jobs };
    if (delta === 1) {
      // Natives only ever farm.
      const natives = colony.natives ?? 0;
      const from = (["workers", "scientists", "farmers"] as const).find((k) => k !== to && next[k] > (k === "farmers" ? natives : 0));
      if (!from) return;
      next[from]--;
      next[to]++;
    } else {
      if (next[to] === 0 || (to === "farmers" && next.farmers <= (colony.natives ?? 0))) return;
      next[to]--;
      next[to === "workers" ? "scientists" : "workers"]++;
    }
    session.issue({ type: "setJobs", colonyId: colony.id, ...next });
  };

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
              {star && <button className="small" onClick={() => onShowStar(star.id)}>Show on map</button>}
            </div>
            <div className="muted">
              {words(planet.size)} {climateName(planet.type)}, {words(planet.minerals)} minerals, {planet.gravity} gravity
              {planet.special !== "none" && `, ${words(planet.special)}`}
            </div>
          </div>
        </div>
        {!colony.outpost && (
          <>
            <table>
              <tbody>
                <tr><td><span className="stat-label"><Icon name="population" />Population</span></td><td>{population(colony)} / {o.maxPopulation} <small className="muted">(+{fmt(o.growthK)}k per turn, {fmt(colony.growthK)}k toward next)</small>
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
                <tr><td>Morale</td><td className={o.morale < 0 ? "bad" : o.morale > 0 ? "good" : ""}>{signed(o.morale)}%{o.blockaded && <span className="bad"> · blockaded, production halved</span>}</td></tr>
                <tr><td>Troops</td><td>{fmt(o.troops)}</td></tr>
              </tbody>
            </table>
            <h4>Jobs</h4>
            {(["farmers", "workers", "scientists"] as const).map((k) => (
              <div className="row" key={k}>
                <span style={{ width: 80 }} className={k === "farmers" ? "food" : k === "workers" ? "industry" : "research"}>{words(k)}</span>
                <button className="small" disabled={readOnly || jobs[k] === 0} onClick={() => move(k, -1)}>−</button>
                <b style={{ width: 22, textAlign: "center" }}>{jobs[k]}</b>
                <button className="small" disabled={readOnly || jobs[k] === population(colony)} onClick={() => move(k, 1)}>+</button>
                <span className={`pips ${k === "farmers" ? "food" : k === "workers" ? "industry" : "research"}`}>
                  {Array.from({ length: jobs[k] }, (_, i) => <i key={i} />)}
                </span>
              </div>
            ))}
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
        <div className="row">
          {colony.buildings.length === 0 && <span className="muted">None</span>}
          {colony.buildings.map((b) => <span key={b} className="chip" title={BUILDINGS_BY_ID[b]?.description}>{BUILDINGS_BY_ID[b]?.name ?? b}</span>)}
        </div>
      </div>

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
          {colony.queue.length === 0 && <div className="warn">Nothing is being built. Industry is wasted.</div>}
          {colony.queue.map((item, i) => {
            const cost = itemCost(view, me.id, item, colony);
            return (
              <div className="row" key={i}>
                <span style={{ width: 18 }} className="muted">{i + 1}.</span>
                <span style={{ flex: 1 }}>
                  {itemName(view, item)}
                  {i === 0 && Number.isFinite(cost) && (
                    <div className="bar" style={{ marginTop: 3 }}><div style={{ width: `${Math.min(100, (colony.progress / cost) * 100)}%` }} /></div>
                  )}
                </span>
                <small className="muted">
                  {Number.isFinite(cost) ? `${fmt(i === 0 ? colony.progress : 0)}/${fmt(cost)}` : "ongoing"}
                </small>
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

function AddToQueue({ onAdd, buildings, designs, projects }: {
  onAdd: (item: BuildItem) => void;
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
            <button key={b} className="small" title={`${def.description} Upkeep ${def.maintenance} BC.`} onClick={() => onAdd({ kind: "building", id: b })}>
              {def.name} <span className="muted">{def.cost}</span>
            </button>
          );
        })}
      </div>
      <div className="row" style={{ gap: 4 }}>
        {designs.map((d) => {
          const design = findDesign(me, d)!;
          return (
            <button key={d} className="small" onClick={() => onAdd({ kind: "ship", designId: d })}>
              ⛭ {design.name} <span className="muted">{fmt(itemCost(view, me.id, { kind: "ship", designId: d }))}</span>
            </button>
          );
        })}
      </div>
      <div className="row" style={{ gap: 4 }}>
        {projects.map((p) => (
          <button key={p} className="small" title={PROJECTS_BY_ID[p]?.description} onClick={() => onAdd({ kind: "project", id: p })}>
            {PROJECTS_BY_ID[p]?.name}
          </button>
        ))}
        <button className="small" title="Converts industry into BC." onClick={() => onAdd({ kind: "tradeGoods" })}>Trade Goods</button>
      </div>
    </div>
  );
}
