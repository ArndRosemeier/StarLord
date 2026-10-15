/**
 * Empire territory on the galaxy map: every colonised star spreads influence
 * around it, the strongest empire at a spot owns it, and the borders are the
 * lines where that changes. Pure maths on a grid, so it can be tested without a canvas.
 */

/** How far (parsecs) a colonised star's influence reaches. */
export const TERRITORY_REACH = 3.4;
/** Influence below this is nobody's space; with the reach above, a lone colony claims about 2.2 parsecs around it. */
const THRESHOLD = 0.12;
/** How far (parsecs) a single colonised star's claim reaches when no other colony is near. */
export const LONE_CLAIM = TERRITORY_REACH * (1 - Math.sqrt(THRESHOLD));
/** Grid cells per parsec. */
export const TERRITORY_CELLS = 8;

export interface TerritoryStar { x: number; y: number; owners: readonly string[] }

export interface Territory {
  cols: number;
  rows: number;
  /** Galaxy units per cell. */
  cell: number;
  /** Owner key (an empire colour) per index of `owner`. */
  empires: string[];
  /** Index into `empires` per grid point (row-major), or -1 for open space. */
  owner: Int16Array;
  /**
   * How far each empire's influence beats its strongest rival (or the threshold)
   * at every grid point, one array per empire: positive inside its space, zero on its border.
   */
  margin: Float32Array[];
}

/** Influence fields on a grid of points spaced 1/TERRITORY_CELLS parsec apart, covering the galaxy plus one reach of margin. */
export function computeTerritory(stars: readonly TerritoryStar[], width: number, height: number): Territory {
  const cell = 1 / TERRITORY_CELLS;
  const pad = TERRITORY_REACH;
  const cols = Math.ceil((width + pad * 2) / cell) + 1;
  const rows = Math.ceil((height + pad * 2) / cell) + 1;
  const empires: string[] = [];
  for (const s of stars) for (const o of s.owners) if (!empires.includes(o)) empires.push(o);
  const fields = empires.map(() => new Float32Array(cols * rows));
  const reachCells = Math.ceil(TERRITORY_REACH / cell);
  for (const s of stars) {
    if (s.owners.length === 0) continue;
    const cx = Math.round((s.x + pad) / cell);
    const cy = Math.round((s.y + pad) / cell);
    for (const o of s.owners) {
      const f = fields[empires.indexOf(o)]!;
      // Each colony adds to its empire's pull, so a star shared by two empires is split by colony count.
      const w = 1 / s.owners.length;
      for (let j = Math.max(0, cy - reachCells); j <= Math.min(rows - 1, cy + reachCells); j++) {
        for (let i = Math.max(0, cx - reachCells); i <= Math.min(cols - 1, cx + reachCells); i++) {
          const d = Math.hypot(i * cell - pad - s.x, j * cell - pad - s.y) / TERRITORY_REACH;
          if (d < 1) f[j * cols + i]! += w * (1 - d) * (1 - d);
        }
      }
    }
  }
  const owner = new Int16Array(cols * rows).fill(-1);
  const margin = empires.map(() => new Float32Array(cols * rows));
  for (let k = 0; k < cols * rows; k++) {
    let best = -1;
    let top = THRESHOLD;
    let second = THRESHOLD;
    for (let e = 0; e < fields.length; e++) {
      const v = fields[e]![k]!;
      if (v > top) {
        second = top;
        top = v;
        best = e;
      } else if (v > second) second = v;
    }
    owner[k] = best;
    for (let e = 0; e < fields.length; e++) {
      const v = fields[e]![k]!;
      // Against the strongest other empire (or empty space): positive only where this empire wins.
      margin[e]![k] = e === best ? v - second : v - top;
    }
  }
  return { cols, rows, cell, empires, owner, margin };
}

/** Galaxy coordinates of grid point (i, j). */
export function gridToGalaxy(t: Territory, i: number, j: number): { x: number; y: number } {
  return { x: i * t.cell - TERRITORY_REACH, y: j * t.cell - TERRITORY_REACH };
}

/**
 * Border line segments of one empire's space (marching squares on its margin field at
 * `level`, a little above zero so two neighbours' borders run side by side instead of on top
 * of each other). Coordinates are in galaxy units, flattened as x1, y1, x2, y2.
 */
export function borderSegments(t: Territory, empire: number, level = 0.012): number[] {
  const m = t.margin[empire]!;
  const { cols, rows, cell } = t;
  const out: number[] = [];
  const x0 = -TERRITORY_REACH;
  const y0 = -TERRITORY_REACH;
  // Where the level crosses the edge between two grid points, as a fraction from the first.
  const cross = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = m[j * cols + i]!; // top left
      const b = m[j * cols + i + 1]!; // top right
      const c = m[(j + 1) * cols + i + 1]!; // bottom right
      const d = m[(j + 1) * cols + i]!; // bottom left
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const px = x0 + i * cell;
      const py = y0 + j * cell;
      const top = () => [px + cross(a, b) * cell, py] as const;
      const right = () => [px + cell, py + cross(b, c) * cell] as const;
      const bottom = () => [px + cross(d, c) * cell, py + cell] as const;
      const left = () => [px, py + cross(a, d) * cell] as const;
      const seg = (p: readonly [number, number], q: readonly [number, number]) => out.push(p[0], p[1], q[0], q[1]);
      switch (code) {
        case 1: case 14: seg(left(), bottom()); break;
        case 2: case 13: seg(bottom(), right()); break;
        case 3: case 12: seg(left(), right()); break;
        case 4: case 11: seg(top(), right()); break;
        case 6: case 9: seg(top(), bottom()); break;
        case 7: case 8: seg(left(), top()); break;
        // Saddles: two separate corners inside.
        case 5: seg(left(), top()); seg(bottom(), right()); break;
        case 10: seg(top(), right()); seg(left(), bottom()); break;
      }
    }
  }
  return out;
}

/** Joins loose segments (x1, y1, x2, y2, ...) that share end points into polylines (x, y, x, y, ...), so strokes get proper joins. */
export function chainSegments(segs: readonly number[]): number[][] {
  const key = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
  const n = segs.length / 4;
  const used = new Uint8Array(n);
  const at = new Map<string, number[]>();
  for (let s = 0; s < n; s++) {
    for (const end of [0, 2]) {
      const k = key(segs[s * 4 + end]!, segs[s * 4 + end + 1]!);
      const list = at.get(k);
      if (list) list.push(s);
      else at.set(k, [s]);
    }
  }
  const next = (x: number, y: number): [number, number, number] | null => {
    for (const s of at.get(key(x, y)) ?? []) {
      if (used[s]) continue;
      used[s] = 1;
      const [ax, ay, bx, by] = [segs[s * 4]!, segs[s * 4 + 1]!, segs[s * 4 + 2]!, segs[s * 4 + 3]!];
      return key(ax, ay) === key(x, y) ? [bx, by, s] : [ax, ay, s];
    }
    return null;
  };
  const lines: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const line = [segs[s * 4]!, segs[s * 4 + 1]!, segs[s * 4 + 2]!, segs[s * 4 + 3]!];
    // Grow forward from the end, then backward from the start.
    for (let p = next(line[2]!, line[3]!); p; p = next(line[line.length - 2]!, line[line.length - 1]!)) line.push(p[0], p[1]);
    for (let p = next(line[0]!, line[1]!); p; p = next(line[0]!, line[1]!)) line.unshift(p[0], p[1]);
    lines.push(line);
  }
  return lines;
}
