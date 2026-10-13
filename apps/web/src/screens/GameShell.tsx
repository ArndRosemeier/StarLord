import { useEffect, useRef, useState } from "react";
import {
  availableTiers, commandPointsAvailable, commandPointsUsed, empireIncome, empireTotals, empires, treatyIncome,
  TIERS_BY_ID, extraResearch, isTradeGoodsOnly, nextBreakthroughChance, researchCost, type CombatReport, type PlayerView,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, signed } from "../ui/format";
import { MapScreen } from "./MapScreen";
import { ColoniesScreen } from "./ColoniesScreen";
import { PlanetsScreen } from "./PlanetsScreen";
import { ResearchScreen } from "./ResearchScreen";
import { DesignScreen } from "./DesignScreen";
import { FleetsScreen } from "./FleetsScreen";
import { DiplomacyScreen } from "./DiplomacyScreen";
import { Audience, type AudienceRequest } from "./Audience";
import { EspionageScreen } from "./EspionageScreen";
import { LeadersScreen } from "./LeadersScreen";
import { EmpireScreen } from "./EmpireScreen";
import { EventsScreen } from "./EventsScreen";
import { GameMenu } from "./GameMenu";
import { DebugMenu } from "./DebugMenu";
import { GameOver } from "./GameOver";
import { EndTurnPrompt } from "./EndTurnPrompt";
import { BasePrompt, coloniesWithReadyBases } from "./BasePrompt";
import { BattlePopup } from "./BattlePopup";
import { CommandBattle } from "./CommandBattle";
import { battlesOfLastTurn } from "../game/battles";
import { audio } from "../audio/sound";
import { MuteButton } from "../ui/AudioControls";
import { useHelp } from "../help/HelpDialog";
import { AnimatedNumber, Icon, ScreenBackdrop, TurnBanner, type BackdropArt } from "../ui/fx";
import { useAutosave } from "../game/autosave";
import { SHORTCUTS, shortcutFor } from "../ui/shortcuts";
import type { MapCycle } from "./MapScreen";

/** Turn report events loud enough to deserve an alert sound. */
const ALERT_EVENTS = new Set(["combat", "colonyLost", "invasionFailed", "bombarded", "eliminated", "raid", "starvation"]);

export type Tab =
  | "map" | "colonies" | "planets" | "research" | "designs" | "fleets" | "diplomacy" | "espionage" | "leaders" | "empire" | "events" | "game";

/** The painted backdrop behind each screen; the galaxy map draws its own sky. */
const BACKDROPS: Record<Exclude<Tab, "map">, BackdropArt> = {
  colonies: "colonies", planets: "galaxy", research: "research", designs: "shipyard", fleets: "fleets", diplomacy: "diplomacy",
  espionage: "espionage", leaders: "leaders", empire: "empire", events: "reports", game: "galaxy",
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "map", label: "Galaxy", icon: "✦" },
  { id: "colonies", label: "Colonies", icon: "◉" },
  { id: "planets", label: "Planets", icon: "◍" },
  { id: "research", label: "Research", icon: "⚗" },
  { id: "designs", label: "Ship design", icon: "⛭" },
  { id: "fleets", label: "Fleets", icon: "➤" },
  { id: "diplomacy", label: "Diplomacy", icon: "☍" },
  { id: "espionage", label: "Espionage", icon: "◐" },
  { id: "leaders", label: "Leaders", icon: "♛" },
  { id: "empire", label: "Empire & automation", icon: "⚙" },
  { id: "events", label: "Turn report", icon: "☰" },
  { id: "game", label: "Game", icon: "⛁" },
];

/** "Colonies (C)": the key that opens a screen, for its button's tooltip. */
function tabKeyHint(tab: Tab): string | undefined {
  const s = SHORTCUTS.find((x) => x.action.kind === "tab" && x.action.tab === tab);
  return s ? `${TABS.find((t) => t.id === tab)?.label} (${s.label})` : undefined;
}

/** Research points per turn including treaty bonuses, researcher leaders and scout labs. */
export function researchPerTurn(view: PlayerView): number {
  return empireTotals(view, view.viewer).research + treatyIncome(view, view.viewer).research + extraResearch(view, view.viewer);
}

export function GameShell({ onQuit }: { onQuit: () => void }) {
  const { session, view, me, readOnly } = useGame();
  const openHelp = useHelp();
  const [tab, setTab] = useState<Tab>("map");
  const [focusStar, setFocusStar] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [seenTurn, setSeenTurn] = useState(view.turn);
  const [overSeen, setOverSeen] = useState(view.over);
  const [colonyFocus, setColonyFocus] = useState<string | null>(null);
  /** The end-turn check being shown: research points that would be lost and colonies making only Trade Goods. */
  const [endCheck, setEndCheck] = useState<{ points: number | null; idle: string[] } | null>(null);
  const [basePrompt, setBasePrompt] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  /** Last turn's battles, opened by themselves as the new turn starts. */
  const [battles, setBattles] = useState<CombatReport[]>([]);
  /** Audiences waiting to be held, the current one first. */
  const [audiences, setAudiences] = useState<AudienceRequest[]>([]);
  const debug = !!view.settings.debug && !readOnly;
  const lastTurn = useRef(view.turn);
  /** A "next idle fleet" or "next colony" request for the map; `n` changes on every press. */
  const [mapCycle, setMapCycle] = useState<MapCycle | null>(null);
  useAutosave(session);

  const totals = empireTotals(view, me.id);
  const income = empireIncome(view, me.id);
  const research = researchPerTurn(view);
  const tier = me.research.tierId ? TIERS_BY_ID[me.research.tierId] : undefined;
  const tierCost = tier ? researchCost(me, tier) : 0;
  const breakthrough = nextBreakthroughChance(me, research);
  const cpUsed = commandPointsUsed(view, me.id);
  const cpMax = commandPointsAvailable(view, me.id);
  const reportBadge = view.turn !== seenTurn ? session.lastTurnEvents(me.id).filter((e) => e.kind !== "explored" && e.kind !== "built").length : 0;

  // Research points with no field are lost, so ask unless there are none, automation picks the field, or none is left.
  const noResearch = !readOnly && research > 0 && !me.research.tierId && !me.automation.includes("research") && availableTiers(view, me.id).length > 0;
  // Colonies with nothing queued sell their industry as Trade Goods; the player can ask to be told, per game.
  const idleColonies = readOnly || me.idleAlertOff || me.automation.includes("production") ? []
    : Object.values(view.colonies).filter((c) => c.ownerId === me.id && isTradeGoodsOnly(c)).map((c) => c.id);
  const endTurn = () => {
    if (noResearch || idleColonies.length > 0) setEndCheck({ points: noResearch ? research : null, idle: idleColonies });
    else session.endTurn({ commandBattles: !autoplay });
  };
  // Ctrl+Enter is bound once, so it calls the latest endTurn through a ref.
  const endTurnRef = useRef(endTurn);
  endTurnRef.current = endTurn;
  const debugRef = useRef(debug);
  debugRef.current = debug;
  const won = view.over && view.winner === me.id && !readOnly;

  useEffect(() => {
    audio.setMood(!view.over ? "galaxy" : readOnly || won ? "victory" : "defeat");
  }, [view.over, won, readOnly]);
  useEffect(() => () => { audio.setMood("none"); }, []);

  // Sound for a new turn, plus an alert when something bad or big happened to us.
  useEffect(() => {
    if (view.turn === lastTurn.current) return;
    lastTurn.current = view.turn;
    if (autoplay) return;
    audio.play("turn");
    if (session.lastTurnEvents(me.id).some((e) => ALERT_EVENTS.has(e.kind))) setTimeout(() => audio.play("alert"), 700);
  }, [view.turn]);

  // Every battle we fought opens as the turn starts, so no loss goes unseen.
  useEffect(() => {
    if (readOnly || autoplay) return;
    // Battles the player commanded were watched as they were fought.
    setBattles(battlesOfLastTurn(session.history, me.id, view.turn).filter((b) => !session.commandedBattles.has(b.id)));
  }, [view.turn]);

  // A finished base with several possible planets waits for the player to pick one, as in MoO2.
  useEffect(() => {
    if (readOnly || autoplay || view.over || me.automation.includes("production")) return;
    if (coloniesWithReadyBases(view.colonies, me.id).length > 0) setBasePrompt(true);
  }, [view.turn]);

  // Other empires ask for an audience when they first meet us, declare war or bring a proposal.
  useEffect(() => {
    if (readOnly || autoplay || view.over) return;
    const news = session.lastTurnEvents(me.id).flatMap((e) => (e.kind === "diplomacy" ? [e] : []));
    const met = news.filter((e) => e.what === "made contact with you").map((e) => ({ themId: e.other, opening: { kind: "contact" as const } }));
    const wars = news.filter((e) => e.what === "declared war on you").map((e) => ({ themId: e.other, opening: { kind: "war" as const } }));
    const offers = me.automation.includes("diplomacy") ? [] : view.proposals
      .filter((p) => p.to === me.id && p.turn === view.turn - 1 && view.players[p.from]?.kind === "empire")
      .map((p) => ({ themId: p.from, opening: { kind: "proposal" as const, proposal: p } }));
    const queue: AudienceRequest[] = [...met, ...wars, ...offers].filter((a) => view.players[a.themId]?.alive);
    setAudiences(queue);
  }, [view.turn]);

  useEffect(() => {
    if (!autoplay || view.over) return;
    const t = setTimeout(endTurn, 120);
    return () => clearTimeout(t);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9" && debugRef.current) {
        e.preventDefault();
        setDebugOpen((o) => !o);
        return;
      }
      if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      endTurnRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // One-letter screen keys and map cycling. Bound in the capture phase so an open window is still seen (and left alone).
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e: KeyboardEvent) => {
    if (document.querySelector(".modal-back, .help-back")) return;
    if (e.key === "Escape") {
      if (tab !== "map" && !e.ctrlKey && !e.altKey && !e.metaKey) go("map");
      return;
    }
    const s = shortcutFor(e);
    if (!s) return;
    const a = s.action;
    if (a.kind === "tab") {
      if (!TABS.some((t) => t.id === a.tab)) return;
      e.preventDefault();
      go(a.tab as Tab);
      return;
    }
    e.preventDefault();
    setTab("map");
    setMapCycle((c) => ({ kind: a.kind === "nextIdleFleet" ? "fleet" : "colony", n: (c?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const go = (t: Tab) => {
    if (t === "events") setSeenTurn(view.turn);
    setColonyFocus(null);
    setTab(t);
  };
  const openColony = (colonyId: string) => {
    setColonyFocus(colonyId);
    setTab("colonies");
  };
  const showStar = (starId: string) => {
    setFocusStar(starId);
    setTab("map");
  };

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">STARLORD</span>
        <div className="stat turn-stat"><small><Icon name="turn" size={12} /> Turn</small><b key={view.turn} className="turn-num">{view.turn}</b></div>
        <div className="row empire-name" style={{ gap: 6 }}>
          <span className="dot glow" style={{ background: me.color, color: me.color }} />
          {readOnly ? (
            <select value={me.id} onChange={(e) => session.watch(Number(e.target.value))}>
              {empires(view).map((p) => <option key={p.id} value={p.id}>{p.name}{p.alive ? "" : " (gone)"}</option>)}
            </select>
          ) : <b>{me.name}</b>}
        </div>
        <div className="stat"><small><Icon name="bc" size={12} /> Treasury</small><span className="bc"><AnimatedNumber value={me.bc} format={fmt} /> BC <small className="muted">({signed(income.net)})</small></span></div>
        <div className="stat"><small><Icon name="food" size={12} /> Food</small><span className={totals.food < 0 ? "bad" : "food"}><AnimatedNumber value={totals.food} format={signed} /></span></div>
        <div className="stat"><small><Icon name="industry" size={12} /> Industry</small><span className="industry"><AnimatedNumber value={totals.industry} format={fmt} /></span></div>
        <div className="stat">
          <small><Icon name="research" size={12} /> Research</small>
          <span className="research"><AnimatedNumber value={research} format={fmt} /> {tier && <small className="muted">→ {tier.name} {breakthrough > 0 ? `${Math.round(breakthrough * 100)}% chance` : `${fmt(me.research.progress)}/${fmt(tierCost)}`}</small>}</span>
          {tier && <span className="stat-meter"><span style={{ width: `${Math.min(100, (me.research.progress / tierCost) * 100)}%` }} /></span>}
        </div>
        <div className="stat"><small><Icon name="command" size={12} /> Command</small><span className={cpUsed > cpMax ? "bad" : ""}>{cpUsed}/{cpMax}</span></div>
        <div className="stat"><small><Icon name="population" size={12} /> Population</small><span><AnimatedNumber value={totals.population} format={fmt} /></span></div>
        <div className="spacer" />
        {debug && <button className="small debug-button" onClick={() => setDebugOpen(true)} title="Debug menu (F9)">Debug</button>}
        <button className="help-button" onClick={() => openHelp()} title="Encyclopedia (F1)">?</button>
        <button className="help-button" onClick={() => go("game")} title="Game menu: save, settings and keyboard shortcuts (G)" aria-label="Settings">⚙</button>
        <MuteButton />
        {view.over && <span className="chip warn">Game over: {view.players[view.winner!]?.name} wins ({view.victory})</span>}
        {readOnly ? (
          <>
            <button onClick={() => setAutoplay(!autoplay)} disabled={view.over}>{autoplay ? "Pause" : "Play"}</button>
            <button className="primary" onClick={endTurn} disabled={view.over || autoplay}>Next turn</button>
          </>
        ) : (
          <>
            {session.pending.length > 0 && (
              <span className="muted" title="Orders given this turn">
                {session.pending.length} order{session.pending.length === 1 ? "" : "s"}{" "}
                <button className="small" onClick={() => session.undo()}>Undo</button>
              </span>
            )}
            <button className="primary end-turn" onClick={endTurn} disabled={view.over} title="End the turn (Ctrl+Enter)">End turn</button>
          </>
        )}
      </div>
      <div className="body">
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => go(t.id)} title={tabKeyHint(t.id)}>
              <span className="nav-icon">{t.icon}</span>
              {t.label}
              {t.id === "events" && reportBadge > 0 && <span className="badge">{reportBadge}</span>}
              {t.id === "diplomacy" && view.proposals.some((p) => p.to === me.id) && <span className="badge">!</span>}
            </button>
          ))}
        </nav>
        <div className="stage">
          {tab !== "map" && <ScreenBackdrop art={BACKDROPS[tab]} />}
          <main className={`content${tab === "map" ? " full" : ""}`}>
            <div className="screen" key={tab}>
              {session.rejected.length > 0 && tab !== "map" && (
                <div className="panel bad" style={{ marginBottom: 12 }}>Some orders are invalid: {session.rejected.join("; ")}</div>
              )}
              {tab === "map" && <MapScreen focusStar={focusStar} onFocused={() => setFocusStar(null)} onOpenColony={openColony}
                onOpenResearch={() => go("research")} onOpenReports={() => go("events")} cycle={mapCycle} onCycled={() => setMapCycle(null)} />}
              {tab === "colonies" && <ColoniesScreen onShowStar={showStar} initialColony={colonyFocus} />}
              {tab === "planets" && <PlanetsScreen onShowStar={showStar} />}
              {tab === "research" && <ResearchScreen />}
              {tab === "designs" && <DesignScreen />}
              {tab === "fleets" && <FleetsScreen onShowStar={showStar} />}
              {tab === "diplomacy" && <DiplomacyScreen onAudience={(r) => setAudiences((q) => [r, ...q])} />}
              {tab === "espionage" && <EspionageScreen />}
              {tab === "leaders" && <LeadersScreen />}
              {tab === "empire" && <EmpireScreen />}
              {tab === "events" && <EventsScreen onShowStar={showStar} />}
              {tab === "game" && <GameMenu onQuit={onQuit} />}
            </div>
          </main>
        </div>
        {view.over && !overSeen && <GameOver won={won} spectating={readOnly} onClose={() => setOverSeen(true)} onQuit={onQuit} />}
      </div>
      {endCheck && (
        <EndTurnPrompt points={endCheck.points} idle={endCheck.idle.flatMap((id) => (view.colonies[id] ? [view.colonies[id]!] : []))}
          onPick={(cmd) => { setEndCheck(null); session.issue(cmd); session.endTurn(); }}
          onEndTurn={() => { setEndCheck(null); session.endTurn(); }}
          onOpenResearch={() => { setEndCheck(null); go("research"); }}
          onOpenColony={(id) => { setEndCheck(null); openColony(id); }} />
      )}
      {battles.length > 0 && !(view.over && !overSeen) && <BattlePopup battles={battles} onClose={() => setBattles([])} />}
      {basePrompt && !endCheck && !audiences[0] && !battles.length && <BasePrompt onClose={() => setBasePrompt(false)} />}
      {audiences[0] && !battles.length && !(view.over && !overSeen) && (
        <Audience key={`${view.turn}:${audiences.length}:${audiences[0].themId}:${audiences[0].opening.kind}`} request={audiences[0]}
          onClose={() => setAudiences((q) => q.slice(1))} />
      )}
      {session.battle && <CommandBattle key={session.battle.pending.key} pending={session.battle.pending} />}
      {debug && debugOpen && <DebugMenu onClose={() => setDebugOpen(false)} />}
      <TurnBanner turn={view.turn} quiet={autoplay} />
    </div>
  );
}
