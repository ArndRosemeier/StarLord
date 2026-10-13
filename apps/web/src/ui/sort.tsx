import { useState, type ReactNode } from "react";

/** Sortable table columns: click a header to sort by it, click again to reverse. */

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> { key: K; dir: SortDir }
/** A cell's sort value; null (and non-finite numbers) always sort last, whatever the direction. */
export type SortValue = number | string | null;

/** Sorts a copy of `rows` by one column, keeping rows with no value at the bottom and ties in their old order. */
export function sortRows<T, K extends string>(rows: readonly T[], sort: SortState<K>, value: (row: T, key: K) => SortValue): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const missing = (v: SortValue) => v === null || (typeof v === "number" && !Number.isFinite(v));
  return rows
    .map((row, i) => ({ row, i, v: value(row, sort.key) }))
    .sort((a, b) => {
      const ma = missing(a.v);
      const mb = missing(b.v);
      if (ma || mb) return ma === mb ? a.i - b.i : ma ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number"
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), undefined, { numeric: true });
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map((x) => x.row);
}

/** Sort state for one table; `firstDir` gives the direction a column starts in when first clicked (numbers usually descend). */
export function useSort<K extends string>(initial: K, initialDir: SortDir = "asc", firstDir: (key: K) => SortDir = () => "asc") {
  const [sort, setSort] = useState<SortState<K>>({ key: initial, dir: initialDir });
  const toggle = (key: K) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir(key) }));
  return { sort, toggle };
}

/** A header cell that sorts its table; shows an arrow on the active column. */
export function SortTh<K extends string>({ k, sort, onSort, children, className, title }: {
  k: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={`sortable${active ? " sorted" : ""}${className ? ` ${className}` : ""}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="sort-button" onClick={() => onSort(k)} title={title ?? "Sort by this column; click again to reverse"}>
        {children}<span className="sort-arrow" aria-hidden>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
