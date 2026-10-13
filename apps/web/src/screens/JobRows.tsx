import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { colonyOutput, farmerFood, population, type Colony } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, signed, words } from "../ui/format";
import { JOBS, grabCount, movedJobs, type Job, type Jobs } from "./jobDrag";

const TONE: Record<Job, string> = { farmers: "food", workers: "industry", scientists: "research" };
/** How far the pointer must travel before a press on an icon becomes a drag. */
const DRAG_START = 4;

interface Drag {
  from: Job;
  count: number;
  /** Icons from this index on are lifted out of their row. */
  index: number;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  moving: boolean;
  over: Job | null;
}

/**
 * The farmers / workers / scientists rows of a colony. Besides the − and +
 * buttons, people can be dragged between rows like in MoO2: grabbing the Nth
 * icon from the right takes it and every icon to its right, so N people move.
 * While dragging, a card shows the colony's food, industry and research after
 * the move, from the sim's own output formula.
 */
export function JobRows({ colony }: { colony: Colony }) {
  const { session, view, readOnly } = useGame();
  const perFarmer = farmerFood(view, colony);
  const jobs: Jobs = { farmers: colony.farmers, workers: colony.workers, scientists: colony.scientists };
  const rows = useRef<Partial<Record<Job, HTMLDivElement | null>>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const update = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  // A new turn or a click on − / + can change the rows under a drag; drop it then.
  useEffect(() => {
    update(null);
  }, [colony.farmers, colony.workers, colony.scientists]);

  const move = (to: Job, delta: 1 | -1) => {
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

  const rowAt = (x: number, y: number): Job | null => {
    for (const k of JOBS) {
      const r = rows.current[k]?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right && y >= r.top - 3 && y <= r.bottom + 3) return k;
    }
    return null;
  };

  const grab = (e: ReactPointerEvent, from: Job, index: number) => {
    if (readOnly || e.button !== 0) return;
    const count = grabCount(colony, from, index);
    if (count <= 0) return;
    e.preventDefault();
    // Touch browsers capture the pointer to the icon; release it so the drop row can be found.
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    update({ from, count, index: jobs[from] - count, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moving: false, over: from });
  };
  // Follow the pointer on the window, so the drag survives icons re-rendering under it.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const track = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const moving = d.moving || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > DRAG_START;
      update({ ...d, x: e.clientX, y: e.clientY, moving, over: rowAt(e.clientX, e.clientY) });
    };
    const drop = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      update(null);
      const to = rowAt(e.clientX, e.clientY);
      const next = d.moving && to ? movedJobs(colony, d.from, to, d.count) : null;
      if (next) session.issue({ type: "setJobs", colonyId: colony.id, ...next });
    };
    const cancel = (e: PointerEvent) => {
      if (dragRef.current?.pointerId === e.pointerId) update(null);
    };
    window.addEventListener("pointermove", track);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", track);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging, colony, session]);

  const target = drag?.moving && drag.over && drag.over !== drag.from ? drag.over : null;
  const next = drag && target ? movedJobs(colony, drag.from, target, drag.count) : null;
  const shown = next ?? jobs;

  return (
    <>
      {JOBS.map((k) => {
        // While dragging over another row, show the people already in their new place.
        const lifted = drag?.moving && drag.from === k && !next ? drag.index : shown[k];
        const arriving = next && k === target ? drag!.count : 0;
        return (
          <div className={`row job-row${target === k ? " drop-target" : ""}${drag?.moving && drag.from === k ? " drag-source" : ""}`}
            key={k} ref={(el) => { rows.current[k] = el; }}>
            <span style={{ width: 80 }} className={TONE[k]}>{words(k)}</span>
            <button className="small" disabled={readOnly || jobs[k] === 0} onClick={() => move(k, -1)}>−</button>
            <b style={{ width: 22, textAlign: "center" }}>{shown[k]}</b>
            <button className="small" disabled={readOnly || jobs[k] === population(colony)} onClick={() => move(k, 1)}>+</button>
            <span className={`pips draggable ${TONE[k]}`} title={readOnly ? undefined : "Drag to another job. Grabbing further left moves more people."}>
              {Array.from({ length: shown[k] }, (_, i) => {
                const fixed = k === "farmers" && i < (colony.natives ?? 0);
                const ghost = drag?.moving && drag.from === k && !next && i >= lifted;
                const fresh = i >= shown[k] - arriving;
                return (
                  <i key={i} className={`${fixed ? "fixed" : ""}${ghost ? " lifted" : ""}${fresh ? " arriving" : ""}`}
                    onPointerDown={readOnly || fixed ? undefined : (e) => grab(e, k, i)} />
                );
              })}
            </span>
            {k === "farmers" && (perFarmer > 0
              ? <small className="muted">+{fmt(perFarmer, 1)} food per extra farmer</small>
              : <small className="bad">Farming grows no food here</small>)}
          </div>
        );
      })}
      {drag?.moving && createPortal(<DragCard colony={colony} drag={drag} next={next} perFarmer={perFarmer} />, document.body)}
    </>
  );
}

/** The card following the pointer: who is being moved and what the colony makes afterwards. */
function DragCard({ colony, drag, next, perFarmer }: { colony: Colony; drag: Drag; next: Jobs | null; perFarmer: number }) {
  const { view } = useGame();
  const now = colonyOutput(view, colony);
  const after = next ? colonyOutput(view, { ...colony, ...next }) : null;
  const to = next && drag.over;
  const who = drag.count === 1 ? words(drag.from).replace(/s$/, "") : `${drag.count} ${words(drag.from).toLowerCase()}`;
  const line = (label: string, tone: string, a: number, b: number | undefined) => (
    <tr key={label}>
      <td className={tone}>{label}</td>
      <td style={{ textAlign: "right" }}>{fmt(b ?? a, 1)}</td>
      <td style={{ textAlign: "right", paddingLeft: 8 }}>
        {b !== undefined && Math.abs(b - a) >= 0.05 && <b className={b > a ? "good" : "bad"}>{signed(b - a, 1)}</b>}
      </td>
    </tr>
  );
  return (
    <div className="tip-card job-drag-card" style={{ left: drag.x + 16, top: drag.y + 16 }}>
      <div className="tip-title">
        <span className={`pips ${TONE[drag.from]}`}>{Array.from({ length: drag.count }, (_, i) => <i key={i} />)}</span>
        {to ? `${who} to ${words(to).toLowerCase()}` : `Moving ${who}`}
      </div>
      <table className="tip-rows"><tbody>
        {line("Food (net)", "food", now.foodNet, after?.foodNet)}
        {line("Industry", "industry", now.industry, after?.industry)}
        {line("Research", "research", now.research, after?.research)}
      </tbody></table>
      {!to && <p>Drop on another job row.</p>}
      {to === "farmers" && perFarmer <= 0 && <p className="bad">Farming grows no food here.</p>}
      {after && after.foodNet < 0 && now.foodNet >= 0 && <p className="bad">The colony would need food shipped in by freighter.</p>}
    </div>
  );
}
