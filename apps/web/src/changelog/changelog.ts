/**
 * Build history for the "What's new" dialog. Every merge to main is one build and adds one file to
 * ./entries named `YYYY-MM-DD-HHMM-short-slug.md` (UTC, taken when the change is merged). The build
 * number is the entry's position in name order times 0.001, so parallel branches never touch the
 * same file. An entry is an optional `# Headline` line followed by `- ` bullet lines for players.
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

/** Releases newest first; `files` maps a path or file name to its markdown. */
export function parseChangelog(files: Record<string, string>): Release[] {
  const names = Object.keys(files).sort((a, b) => baseName(a).localeCompare(baseName(b)));
  return names
    .map((path, i) => {
      const file = baseName(path);
      const lines = files[path]!.split(/\r?\n/).map((l) => l.trim());
      const title = lines.find((l) => l.startsWith("# "))?.slice(2).trim();
      return {
        version: versionLabel(i + 1),
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
