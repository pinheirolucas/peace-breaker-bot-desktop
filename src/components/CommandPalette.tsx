import * as RadixDialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { arrange, filterThemes, flatten } from "../lib/palette";
import type { PaletteCandidates, PaletteItem, PalettePreview } from "../lib/palette";
import { Key } from "./Key";
import "./commandPalette.css";

// Twenty-pixel strokes, lifted from the design canvas.
const ICONS: Record<string, string> = {
  search: "M8.5 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM13 13l4 4",
  plus: "M10 4v12M4 10h12",
  stop: "M6 6h8v8H6z",
  star: "M10 3l2.2 4.5 5 .7-3.6 3.5.9 5L10 14.3l-4.5 2.4.9-5L2.8 8.2l5-.7z",
  compass: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM12.8 7.2l-1.6 4-4 1.6 1.6-4z",
  palette: "M10 3a7 7 0 1 0 0 14c1 0 1.5-.6 1.5-1.3 0-.9-.7-1.2-.7-2 0-.8.6-1.2 1.4-1.2H14a3 3 0 0 0 3-3C17 5.6 14 3 10 3Z",
  globe: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM3 10h14M10 3c2 2 3 4.3 3 7s-1 5-3 7c-2-2-3-4.3-3-7s1-5 3-7Z",
  server: "M4 4h12v5H4zM4 11h12v5H4zM7 6.5h.01M7 13.5h.01",
  keyboard: "M3 6h14v9H3zM6 9h.01M9 9h.01M12 9h.01M6.5 12h7",
  refresh: "M16 10a6 6 0 1 1-1.8-4.3M16 3.5V6h-2.5",
  download: "M10 3v9M6.5 8.5 10 12l3.5-3.5M4 16h12",
  upload: "M10 12V3M6.5 6.5 10 3l3.5 3.5M4 16h12",
  sliders: "M4 6h7M15 6h1M4 14h1M9 14h7M13 4v4M7 12v4",
  reorder: "M4 6h12M4 10h12M4 14h12",
  wave: "M3 10h1M6 7v6M9 4v12M12 7v6M15 9v2M17 10h0",
  moon: "M16 11.5A6.5 6.5 0 0 1 8.5 4a6.5 6.5 0 1 0 7.5 7.5Z",
  check: "M4.5 10.5l3.5 3.5 7.5-8"
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] ?? ICONS.star} />
    </svg>
  );
}

export interface PaletteStatus {
  tone: "ok" | "warn" | "bad";
  text: string;
}

export interface CommandPaletteProps {
  open: boolean;
  /** Any dismissal: Esc, a click outside, the shortcut again, or a row that ran. */
  onOpenChange: (open: boolean) => void;
  candidates: PaletteCandidates;
  /** The eight palettes, for the sub-list Paleta opens: each previews its own theme and saves it on Enter. */
  themes: PaletteItem[];
  /** The live preview: a patch to show, or null to drop it. Called on every arrow and on every way out. */
  onPreview: (preview: PalettePreview | null) => void;
  status: PaletteStatus;
  /** For a story: start with this typed, or already inside the theme list. */
  initialQuery?: string;
  initialView?: "root" | "themes";
  /** Where to draw it instead of <body>: a story frames the palette in a window-sized box. */
  container?: HTMLElement | null;
}

type View = "root" | "themes";

/**
 * The command palette: one field for everything the app does. A modal dialog
 * in the shortcut sheet's own language. It only asks — every row carries the
 * handler its own button, menu or card already runs — and it closes before it
 * opens anything else. The one thing it holds is the preview: highlighting a
 * palette or a colour mode repaints the app at once, Enter saves it, and any
 * other way out drops it, so no draft outlives the palette.
 */
export default function CommandPalette({
  open,
  onOpenChange,
  candidates,
  themes,
  onPreview,
  status,
  initialQuery = "",
  initialView = "root",
  container
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [view, setView] = useState<View>(initialView);
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState("");
  const previewing = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const latestPreview = useRef(onPreview);
  latestPreview.current = onPreview;

  const labels = useMemo(
    () => ({
      recents: t("palette.recents"),
      recentsNote: t("palette.recentsNote"),
      playing: t("palette.playing"),
      sounds: t("palette.sounds"),
      soundsNote: (shown: number, total: number) => t("palette.soundsNote", { shown, total }),
      explore: t("palette.exploreGroup"),
      actions: t("palette.actions"),
      settings: t("palette.settings"),
      servers: t("palette.servers")
    }),
    [t]
  );

  const groups = useMemo(
    () => (view === "themes" ? [] : arrange(query, candidates, labels)),
    [view, query, candidates, labels]
  );
  const themeRows = useMemo(() => filterThemes(themes, query), [themes, query]);
  const rows = view === "themes" ? themeRows : flatten(groups);
  const active = rows[Math.min(selected, Math.max(0, rows.length - 1))] as PaletteItem | undefined;

  // Opening starts clean; the preview is dropped however the palette closed.
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setView(initialView);
      setSelected(0);
      setNote("");
    } else if (previewing.current) {
      previewing.current = false;
      latestPreview.current(null);
    }
    // Only the opening resets it; a story's initial values are for that first open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Entering the theme list starts on the palette in use.
  useEffect(() => {
    if (view === "themes") {
      const index = themes.findIndex((item) => item.current);
      setSelected(index >= 0 ? index : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // The highlighted row previews itself; one that has nothing to preview drops what the last one showed.
  // Keyed on the payload, not the row: the caller rebuilds its rows on every render, and a preview that
  // repaints the app would otherwise be answered by a new row, which previews again.
  const previewKey = active?.preview ? JSON.stringify(active.preview) : "";
  useEffect(() => {
    if (!open) return;

    if (previewKey) {
      previewing.current = true;
      latestPreview.current(JSON.parse(previewKey) as PalettePreview);
    } else if (previewing.current) {
      previewing.current = false;
      latestPreview.current(null);
    }
  }, [open, previewKey]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close() {
    onOpenChange(false);
  }

  function choose(item: PaletteItem, secondary: boolean) {
    if (item.refused && !secondary) {
      setNote(t("palette.botAway"));
      return;
    }

    if (item.kind === "drill") {
      setQuery("");
      setView("themes");
      return;
    }

    // A previewed choice is saved by its own handler; there is nothing left to drop.
    if (item.preview) previewing.current = false;
    close();
    item.run(secondary);
  }

  function back() {
    setQuery("");
    setSelected(0);
    setView("root");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const count = rows.length;
    const current = Math.min(selected, Math.max(0, count - 1));

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setNote("");
      setSelected(count ? (current + 1) % count : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setNote("");
      setSelected(count ? (current - 1 + count) % count : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active) choose(active, event.shiftKey);
    } else if (event.key === "Backspace" && query === "" && view === "themes") {
      event.preventDefault();
      back();
    }
  }

  const hasQuery = query.trim() !== "";
  const hints: { keys: string; text: string; dim?: boolean }[] = [{ keys: "↑↓", text: t("palette.hintNavigate") }];

  if (view === "themes") {
    hints.push({ keys: "↵", text: t("palette.hintUse") }, { keys: "⌫", text: t("palette.hintBack") }, { keys: "esc", text: t("palette.hintCancel") });
  } else {
    if (active?.kind === "sound") {
      hints.push({ keys: "↵", text: t("palette.hintDiscord"), dim: active.refused }, { keys: "⇧↵", text: t("palette.hintLocal") });
    } else if (active?.kind === "explore") {
      hints.push({ keys: "↵", text: t("palette.hintExplore") });
    } else if (active?.kind === "stop") {
      hints.push({ keys: "↵", text: t("palette.hintStop") });
    } else if (active?.kind === "drill") {
      hints.push({ keys: "↵", text: t("palette.hintOpenList") });
    } else if (active) {
      hints.push({ keys: "↵", text: active.kind === "setting" ? t("palette.hintApply") : t("palette.hintRun") });
    }
    hints.push({ keys: "esc", text: hasQuery ? t("palette.hintClear") : t("palette.hintClose") });
  }

  let index = -1;
  const renderRow = (item: PaletteItem) => {
    index += 1;
    const position = index;
    const isSelected = position === Math.min(selected, Math.max(0, rows.length - 1));
    const tag = item.current ? t("palette.current") : item.tag;

    return (
      <div
        key={item.id}
        id={`palette-row-${item.id}`}
        role="option"
        aria-selected={isSelected}
        aria-disabled={item.refused || undefined}
        className="prow"
        data-selected={isSelected || undefined}
        data-dim={item.dim || undefined}
        onMouseMove={() => selected !== position && setSelected(position)}
        onClick={() => choose(item, false)}
      >
        <span className={["pic", item.slot && "tile", item.slot].filter(Boolean).join(" ")} aria-hidden="true">
          {item.swatch ? <span className="sw8" data-theme={item.swatch} data-mode={document.documentElement.dataset.mode} /> : item.glyph ? <b>{item.glyph}</b> : <Icon name={item.kind === "sound" ? "wave" : (item.icon ?? "star")} />}
        </span>
        <span className="ptx">
          <span className="ptt">{item.title}</span>
          {item.sub && <span className="psb">{item.sub}</span>}
        </span>
        <span className="prt">
          {tag && <span className={["ptg", item.tagTone].filter(Boolean).join(" ")}>{tag}</span>}
          {item.keys?.map((key) => (
            <Key quiet key={key}>
              {key}
            </Key>
          ))}
        </span>
      </div>
    );
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={container ?? undefined}>
        <RadixDialog.Overlay className="pscrim" />
        <RadixDialog.Content
          className="pal"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("palette-input")?.focus();
          }}
          onEscapeKeyDown={(event) => {
            // Esc backs out one step at a time: the theme list, then the text, then the palette.
            if (view === "themes") {
              event.preventDefault();
              back();
            } else if (hasQuery) {
              event.preventDefault();
              setQuery("");
              setSelected(0);
            }
          }}
        >
          <RadixDialog.Title className="sr">{t("palette.title")}</RadixDialog.Title>
          <div className="pin">
            <Icon name="search" />
            {view === "themes" && <span className="crumb">{t("palette.paletteCrumb")}</span>}
            <input
              id="palette-input"
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={active ? `palette-row-${active.id}` : undefined}
              aria-label={t("palette.inputLabel")}
              placeholder={view === "themes" ? t("palette.themePlaceholder") : t("palette.placeholder")}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(0);
                setNote("");
              }}
              onKeyDown={onKeyDown}
            />
            <Key quiet>esc</Key>
          </div>

          <div className="pbd" id="palette-list" role="listbox" aria-label={t("palette.title")} ref={list}>
            {view === "themes" ? (
              <div role="group" aria-label={t("palette.paletteCrumb")}>
                <div className="pgh">
                  {t("palette.paletteCrumb")}
                  <span>{t("palette.previewNote")}</span>
                </div>
                {themeRows.map(renderRow)}
                {themeRows.length === 0 && <NoMatch text={t("palette.noThemes")} />}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.id} role="group" aria-label={group.title}>
                  <div className="pgh">
                    {group.title}
                    {group.note && <span>{group.note}</span>}
                  </div>
                  {group.items.map(renderRow)}
                </div>
              ))
            )}
            {view === "root" && rows.length === 0 && (
              <NoMatch text={t("palette.noMatch", { query: query.trim() })} hint={t("palette.noMatchHint")} />
            )}
          </div>

          <div className="pft">
            <span className="pst" role="status">
              <i data-tone={status.tone} aria-hidden="true" />
              {note || status.text}
            </span>
            <span className="phs">
              {hints.map((hint) => (
                <span key={hint.keys} data-dim={hint.dim || undefined}>
                  <Key quiet>{hint.keys}</Key>
                  {hint.text}
                </span>
              ))}
            </span>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function NoMatch({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="pemp">
      <b>{text}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}
