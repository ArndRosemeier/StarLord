/**
 * Build history for the "What's new" dialog. Every merge to main is one build and adds one file to
 * ./entries named `YYYY-MM-DD-HHMM-short-slug.md` (UTC, taken when the change is merged). The build
 * number counts up by 0.001 per entry in name order, so parallel branches never touch the same
 * file. An entry is an optional `# Headline` line followed by `- ` bullet lines for players. A
 * milestone entry may pin its own number with a `Version: 1.000` line; the entries after it count
 * on from there (1.001, 1.002, ...).
 */
export interface Release {
  version: string;
  date: string;
  title?: string;
  notes: string[];
  file: string;
}

export const ENTRY_NAME = /^(\d{4}-\d{2}-\d{2})-\d{4}-[a-z0-9-]+\.md$/;

export const versionLabel = (n: number) => (n / 1000).toFixed(3);

const PIN = /^version:\s*(\d+\.\d{3})$/i;

/** Releases newest first; `files` maps a path or file name to its markdown. */
export function parseChangelog(files: Record<string, string>): Release[] {
  const names = Object.keys(files).sort((a, b) => baseName(a).localeCompare(baseName(b)));
  let build = 0;
  return names
    .map((path) => {
      const file = baseName(path);
      const lines = files[path]!.split(/\r?\n/).map((l) => l.trim());
      const title = lines.find((l) => l.startsWith("# "))?.slice(2).trim();
      const pin = lines.map((l) => PIN.exec(l)).find((m) => m);
      build = pin ? Math.round(Number(pin[1]) * 1000) : build + 1;
      return {
        version: versionLabel(build),
        date: ENTRY_NAME.exec(file)?.[1] ?? "",
        title,
        notes: lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()),
        file,
      };
    })
    .reverse();
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

const ENTRIES = import.meta.glob<string>("./entries/*.md", { query: "?raw", import: "default", eager: true });

export const RELEASES = parseChangelog(ENTRIES);
export const VERSION = RELEASES[0]?.version ?? versionLabel(0);
