import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Player } from "@starlord/sim";
import type { GameSession } from "../game/session";
import { ENTRIES, ENTRIES_BY_ID, GROUPS, searchEntries, type HelpGroup } from "./entries";
import { Article } from "./articles";

/** Opens the encyclopedia anywhere in the app, optionally at a page such as "tech:laserCannon". */
const HelpOpen = createContext<(id?: string) => void>(() => {});
export const useHelp = () => useContext(HelpOpen);

interface Nav {
  go: (id: string) => void;
  /** The viewer's empire when a game is running, so pages can mark what is already known. */
  me: Player | null;
}
const HelpNav = createContext<Nav>({ go: () => {}, me: null });
export const useHelpNav = () => useContext(HelpNav);

/** A cross-reference to another encyclopedia page. */
export function HelpLink({ to, children }: { to: string; children?: ReactNode }) {
  const { go } = useHelpNav();
  const entry = ENTRIES_BY_ID.get(to);
  if (!entry) return <span className="help-missing">{children ?? to}</span>;
  return (
    <a className="help-link" href={`#${to}`} onClick={(e) => { e.preventDefault(); go(to); }}>
      {children ?? entry.title}
    </a>
  );
}

export function HelpProvider({ session, children }: { session: GameSession | null; children: ReactNode }) {
  const [page, setPage] = useState<string | null>(null);
  const open = useCallback((id?: string) => setPage(id && ENTRIES_BY_ID.has(id) ? id : "guide:start"), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F1") return;
      e.preventDefault();
      setPage((p) => (p ? null : "guide:start"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const me = session ? session.view.players[session.view.viewer] ?? null : null;
  return (
    <HelpOpen.Provider value={open}>
      {children}
      {page && <HelpDialog start={page} me={me} onClose={() => setPage(null)} />}
    </HelpOpen.Provider>
  );
}

function HelpDialog({ start, me, onClose }: { start: string; me: Player | null; onClose: () => void }) {
  const [history, setHistory] = useState<{ list: string[]; at: number }>({ list: [start], at: 0 });
  const [query, setQuery] = useState("");
  const [openGroup, setOpenGroup] = useState<HelpGroup | null>(ENTRIES_BY_ID.get(start)?.group ?? "guide");
  const articleRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = history.list[history.at]!;

  const go = useCallback((id: string) => {
    setHistory((h) => (h.list[h.at] === id ? h : { list: [...h.list.slice(0, h.at + 1), id], at: h.at + 1 }));
    const g = ENTRIES_BY_ID.get(id)?.group;
    if (g) setOpenGroup(g);
  }, []);
  const back = () => setHistory((h) => ({ ...h, at: Math.max(0, h.at - 1) }));
  const forward = () => setHistory((h) => ({ ...h, at: Math.min(h.list.length - 1, h.at + 1) }));

  useEffect(() => articleRef.current?.scrollTo(0, 0), [current]);
  useEffect(() => searchRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.altKey && e.key === "ArrowLeft") back();
      if (e.altKey && e.key === "ArrowRight") forward();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => searchEntries(query), [query]);
  const entry = ENTRIES_BY_ID.get(current);
  const nav = useMemo(() => ({ go, me }), [go, me]);

  return (
    <HelpNav.Provider value={nav}>
      <div className="help-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="help" role="dialog" aria-label="Encyclopedia">
          <div className="help-head">
            <button className="small" onClick={back} disabled={history.at === 0} title="Back (Alt+←)">←</button>
            <button className="small" onClick={forward} disabled={history.at >= history.list.length - 1} title="Forward (Alt+→)">→</button>
            <b className="help-brand">Encyclopedia</b>
            <span className="muted help-crumb">
              {entry && <>{GROUPS.find((g) => g.id === entry.group)?.name} › {entry.title}</>}
            </span>
            <span className="spacer" />
            <small className="muted">F1 toggles this window</small>
            <button className="small" onClick={onClose} title="Close (Esc)">✕</button>
          </div>
          <div className="help-body">
            <aside className="help-side">
              <input ref={searchRef} type="search" placeholder="Search techs, buildings, rules…" value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0].id); }} />
              {query.trim() ? (
                <div className="help-list">
                  {results.length === 0 && <div className="muted" style={{ padding: 8 }}>Nothing found.</div>}
                  {results.map((r) => (
                    <button key={r.id} className={r.id === current ? "active" : ""} onClick={() => go(r.id)}>
                      {r.title}
                      {r.subtitle && <small className="muted">{r.subtitle}</small>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="help-list">
                  {GROUPS.map((g) => (
                    <div key={g.id}>
                      <button className="help-group" onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}>
                        <span>{openGroup === g.id ? "▾" : "▸"}</span> {g.name}
                      </button>
                      {openGroup === g.id && ENTRIES.filter((x) => x.group === g.id && x.overview).map((x) => (
                        <button key={x.id} className={`help-item${x.id === current ? " active" : ""}`} onClick={() => go(x.id)}>{x.title}</button>
                      ))}
                    </div>
                  ))}
                  <small className="muted" style={{ padding: "8px 6px" }}>
                    {ENTRIES.length} pages, generated from the game's rules.
                  </small>
                </div>
              )}
            </aside>
            <div className="help-article" ref={articleRef}>
              <PageBoundary key={current} id={current}><Article id={current} /></PageBoundary>
            </div>
          </div>
        </div>
      </div>
    </HelpNav.Provider>
  );
}

/** Shows a page that fails to render as an error message instead of blanking the whole game. */
class PageBoundary extends Component<{ id: string; children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="col">
        <h2>This page failed to load</h2>
        <p className="muted">Please send this message to the developers. Other pages still work.</p>
        <pre className="help-error">{`${this.props.id}\n${error.message}\n${error.stack ?? ""}`}</pre>
      </div>
    );
  }
}
