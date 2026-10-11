import { useEffect, useRef, useState } from "react";
import {
  availableTiers, commandPointsAvailable, commandPointsUsed, empireIncome, empireTotals, empires, treatyIncome, treatyTotals,
  TIERS_BY_ID, extraResearch, nextBreakthroughChance, researchCost, type PlayerView,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, signed } from "../ui/format";
import { MapScreen } from "./MapScreen";
import { ColoniesScreen } from "./ColoniesScreen";
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
import { ResearchPrompt } from "./ResearchPrompt";
import { BasePrompt, coloniesWithReadyBases } from "./BasePrompt";
import { audio } from "../audio/sound";
import { MuteButton } from "../ui/AudioControls";
import { useHelp } from "../help/HelpDialog";
import { AnimatedNumber, Icon, ScreenBackdrop, TurnBanner, type BackdropArt } from "../ui/fx";

/** Turn report events loud enough to deserve an alert sound. */
const ALERT_EVENTS = new Set(["combat", "colonyLost", "invasionFailed", "bombarded", "eliminated", "raid", "starvation"]);

export type Tab =
  | "map" | "colonies" | "research" | "designs" | "fleets" | "diplomacy" | "espionage" | "leaders" | "empire" | "events" | "game";

/** The painted backdrop behind each screen; the galaxy map draws its own sky. */
const BACKDROPS: Record<Exclude<Tab, "map">, BackdropArt> = {
  colonies: "colonies", research: "research", designs: "shipyard", fleets: "fleets", diplomacy: "diplomacy",
  espionage: "espionage", leaders: "leaders", empire: "empire", events: "reports", game: "galaxy",
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "map", label: "Galaxy", icon: "✦" },
  { id: "colonies", label: "Colonies", icon: "◉" },
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

/** Research points per turn including treaty bonuses, researcher leaders and scout labs. */
export function researchPerTurn(view: PlayerView): number {
  const totals = treatyTotals(view);
  return (totals.get(view.viewer)?.research ?? 0) + treatyIncome(view, view.viewer, totals).research + extraResearch(view, view.viewer);
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
  const [researchWarning, setResearchWarning] = useState(false);
  const [basePrompt, setBasePrompt] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  /** Audiences waiting to be held, the current one first. */
  const [audiences, setAudiences] = useState<AudienceRequest[]>([]);
  const debug = !!view.settings.debug && !readOnly;
  const lastTurn = useRef(view.turn);

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
  const endTurn = () => {
    if (noResearch) setResearchWarning(true);
    else session.endTurn();
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
  useEffect(() => () => audio.setMood("none"), []);

  // Sound for a new turn, plus an alert when something bad or big happened to us.
  useEffect(() => {
    if (view.turn === lastTurn.current) return;
    lastTurn.current = view.turn;
    if (autoplay) return;
    audio.play("turn");
    if (session.lastTurnEvents(me.id).some((e) => ALERT_EVENTS.has(e.kind))) setTimeout(() => audio.play("alert"), 700);
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
            <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => go(t.id)}>
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
                onOpenResearch={() => go("research")} onOpenReports={() => go("events")} />}
              {tab === "colonies" && <ColoniesScreen onShowStar={showStar} initialColony={colonyFocus} />}
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
      {researchWarning && (
        <ResearchPrompt points={research}
          onPick={(cmd) => { setResearchWarning(false); session.issue(cmd); session.endTurn(); }}
          onSkip={() => { setResearchWarning(false); session.endTurn(); }}
          onOpenScreen={() => { setResearchWarning(false); go("research"); }} />
      )}
      {basePrompt && !researchWarning && !audiences[0] && <BasePrompt onClose={() => setBasePrompt(false)} />}
      {audiences[0] && !(view.over && !overSeen) && (
        <Audience key={`${view.turn}:${audiences.length}:${audiences[0].themId}:${audiences[0].opening.kind}`} request={audiences[0]}
          onClose={() => setAudiences((q) => q.slice(1))} />
      )}
      {debug && debugOpen && <DebugMenu onClose={() => setDebugOpen(false)} />}
      <TurnBanner turn={view.turn} quiet={autoplay} />
    </div>
  );
}
