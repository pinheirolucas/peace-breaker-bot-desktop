import type { ColorMode, ThemeId } from "../themes";

// The command palette's rules, apart from the component: what is a row, how a
// query finds one, and which groups a query shows in which order. Pure, so the
// ranking is tested without a DOM. The component draws what this returns; the
// App builds the candidates, each with the handler its own button already runs.

export type PaletteKind = "sound" | "explore" | "action" | "setting" | "stop" | "drill";

/** What highlighting a row does to the app before anything is chosen: the live preview. Nothing is saved until Enter. */
export interface PalettePreview {
  theme?: ThemeId;
  mode?: ColorMode;
}

export interface PaletteItem {
  id: string;
  kind: PaletteKind;
  title: string;
  sub?: string;
  /** Words a query may match that the title does not say. */
  keywords?: string;
  /** Keycaps at the row's right edge. */
  keys?: string[];
  tag?: string;
  tagTone?: "warn";
  icon?: string;
  /** A sound's tile: the card's own slot class, and the favourite's key. */
  slot?: string;
  glyph?: string;
  /** The option in use: it carries the "atual" tag. */
  current?: boolean;
  dim?: boolean;
  /** The palette this row previews (the theme sub-list). */
  swatch?: ThemeId;
  preview?: PalettePreview;
  /** True for a row whose Enter does nothing but say why (a sound the bot cannot take). */
  refused?: boolean;
  /** Enter runs the primary, Shift+Enter the secondary. Only sounds have a secondary. */
  run: (secondary: boolean) => void;
}

export interface PaletteGroup {
  id: string;
  title: string;
  note?: string;
  items: PaletteItem[];
}

export interface PaletteCandidates {
  /** Shown with no query. */
  recents: PaletteItem[];
  sounds: PaletteItem[];
  /** Parar o som, only while something plays: it goes first, selected. */
  playing?: PaletteItem;
  /** The row that carries a query to the catalogue. */
  explore?: (query: string) => PaletteItem;
  actions: PaletteItem[];
  /** How many actions show with no query. */
  defaultActions: number;
  settings: PaletteItem[];
  servers: PaletteItem[];
}

export interface PaletteLabels {
  recents: string;
  recentsNote: string;
  playing: string;
  sounds: string;
  soundsNote: (shown: number, total: number) => string;
  explore: string;
  actions: string;
  settings: string;
  servers: string;
}

/** Lower case and no accents, so "acoes" finds "Ações". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * How well `query` matches: 0 the title starts with it, 1 a word of the title
 * does, 2 it is inside the title, 3 a keyword starts with it, 4 it is inside a
 * keyword; -1 not at all. An empty query matches everything, last.
 */
export function matchRank(title: string, keywords: string | undefined, query: string): number {
  if (!query) return 3;

  const name = normalize(title);
  const extra = normalize(keywords ?? "");

  if (name.startsWith(query)) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 1;
  if (name.includes(query)) return 2;
  if (extra.split(/\s+/).some((word) => word.startsWith(query))) return 3;
  if (extra.includes(query)) return 4;
  return -1;
}

function rank(items: PaletteItem[], query: string, limit: number): PaletteItem[] {
  return items
    .map((item, index) => ({ item, index, rank: matchRank(item.title, item.keywords, query) }))
    .filter((entry) => entry.rank >= 0)
    // Stable: equal ranks keep the order the caller listed them in.
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/** A leading ">" narrows the palette to actions and settings. */
export function parseQuery(raw: string): { query: string; commands: boolean } {
  const trimmed = raw.trim();
  const commands = trimmed.startsWith(">");
  return { query: normalize(commands ? trimmed.slice(1) : trimmed).trim(), commands };
}

/** The groups for a query, in the order the design fixes: playing, recents or sounds, explore, actions, settings, servers. */
export function arrange(raw: string, c: PaletteCandidates, labels: PaletteLabels): PaletteGroup[] {
  const { query, commands } = parseQuery(raw);
  const groups: PaletteGroup[] = [];
  const push = (group: PaletteGroup) => {
    if (group.items.length > 0) groups.push(group);
  };

  if (c.playing && matchRank(c.playing.title, c.playing.keywords, query) >= 0) {
    push({ id: "playing", title: labels.playing, items: [c.playing] });
  }

  if (!commands) {
    if (!query) {
      push({ id: "recents", title: labels.recents, note: labels.recentsNote, items: c.recents.slice(0, 3) });
    } else {
      // The favourite's own key finds it too: "v" is Vine boom.
      const found = c.sounds
        .map((item, index) => ({ item, index, rank: item.glyph && normalize(item.glyph) === query ? 0 : matchRank(item.title, item.keywords, query) }))
        .filter((entry) => entry.rank >= 0)
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map((entry) => entry.item);

      push({ id: "sounds", title: labels.sounds, note: labels.soundsNote(Math.min(found.length, 4), c.sounds.length), items: found.slice(0, 4) });
    }

    // The catalogue is never searched per keystroke: it is one row that carries the text over.
    if (query && c.explore) push({ id: "explore", title: labels.explore, items: [c.explore(raw.trim())] });
  }

  push({
    id: "actions",
    title: labels.actions,
    items: query ? rank(c.actions, query, 4) : c.actions.slice(0, c.defaultActions)
  });

  if (query) {
    push({ id: "settings", title: labels.settings, items: rank(c.settings, query, 6) });
    push({ id: "servers", title: labels.servers, items: rank(c.servers, query, 3) });
  }

  return groups;
}

/** Every row of every group, in reading order: what the arrow keys walk. */
export function flatten(groups: PaletteGroup[]): PaletteItem[] {
  return groups.flatMap((group) => group.items);
}

/** The palette rows of the theme sub-list: the eight, filtered by what is typed. */
export function filterThemes(items: PaletteItem[], raw: string): PaletteItem[] {
  const query = normalize(raw.trim());
  return query ? rank(items, query, items.length) : items;
}

/** Recents: the newest first, one entry per clip, three kept. */
export function pushRecent(recents: string[], url: string): string[] {
  return [url, ...recents.filter((entry) => entry !== url)].slice(0, 3);
}
