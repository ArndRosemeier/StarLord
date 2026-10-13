import { AlphaFilter, Container, Graphics } from "pixi.js";
import { unionArcs, type RangeCircle } from "./scene";

/**
 * The empire-wide range displays (fuel range, scanner coverage), drawn as one merged
 * area: the discs are filled together and faded as a whole so overlaps don't darken,
 * and only the outer edge of the union gets a line.
 */

/** One range display: a faint merged fill and its outline; `unit` is pixels per parsec. */
export function rangeLayer(circles: readonly RangeCircle[], unit: number, color: number, opts: { fill: number; dashed?: boolean }): Container {
  const layer = new Container();
  const fill = new Graphics();
  for (const c of circles) fill.circle(c.x * unit, c.y * unit, c.r * unit);
  fill.fill({ color, alpha: 1 });
  const fade = new Container();
  fade.addChild(fill);
  fade.filters = [new AlphaFilter({ alpha: opts.fill })];
  layer.addChild(fade);
  const edge = new Graphics();
  for (const { circle: c, arcs } of unionArcs(circles)) {
    for (const [a0, a1] of arcs) {
      if (opts.dashed) {
        // Dashes about 8 px long with 6 px gaps, whatever the radius.
        const r = c.r * unit;
        const dash = 8 / r;
        const gap = 6 / r;
        for (let a = a0; a < a1; a += dash + gap) {
          const e = Math.min(a1, a + dash);
          edge.moveTo(c.x * unit + Math.cos(a) * r, c.y * unit + Math.sin(a) * r).arc(c.x * unit, c.y * unit, r, a, e);
        }
      } else {
        edge.moveTo(c.x * unit + Math.cos(a0) * c.r * unit, c.y * unit + Math.sin(a0) * c.r * unit).arc(c.x * unit, c.y * unit, c.r * unit, a0, a1);
      }
    }
  }
  edge.stroke({ width: 1.5, color, alpha: 0.75 });
  layer.addChild(edge);
  return layer;
}
