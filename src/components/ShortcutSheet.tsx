import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ShortcutResult } from "../../electron/shortcuts";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { SegmentedChoice } from "./Segmented";
import { Switch } from "./Switch";
import { comboLabel, comboParts } from "../hooks/usePlatform";
import { useGlobalShortcutSettings } from "../hooks/useGlobalShortcuts";
import { menuBridge } from "../hooks/useMenuBridge";
import { isEditableTarget } from "../lib/clipKeys";
import { slotFor } from "../lib/slot";
import { SearchIcon } from "../icons";
import type { PlatformId } from "../themes";
import type { Instant } from "../storage";
import "./shortcuts.css";

export interface ShortcutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instants: Instant[];
  os: PlatformId;
  status: ShortcutResult;
  onOrganize: () => void;
}

interface AppKey {
  id: string;
  group: "play" | "navigate" | "add" | "app";
  keys: string[];
  label: string;
  /** The menu the command lives in. */
  menu: string;
  /** Only exists with the menu bar, so it is left out of a plain browser tab. */
  needsMenuBar?: boolean;
}

function Key({ children, slot }: { children: ReactNode; slot?: string }) {
  return (
    <kbd className={["ksheet__key", slot].filter(Boolean).join(" ")} data-slot={slot ? "" : undefined}>
      {children}
    </kbd>
  );
}

function Keys({ parts }: { parts: string[] }) {
  return (
    <span className="ksheet__keys">
      {parts.map((part, index) => (
        <Key key={`${part}-${index}`}>{part}</Key>
      ))}
    </span>
  );
}

/**
 * Every key the app acts on, most-used first: a legend, the sounds with
 * their keys (and, with global keys on, the combination that reaches the app
 * from outside), the switch that controls those combinations, then the
 * window's own commands grouped and each tagged with its menu. Rows come from
 * the same sources as the handlers (Instant.key, and one table for the window
 * keys), so it never lists a key the app will not act on. The global section
 * needs the Electron bridge.
 */
export default function ShortcutSheet({
  open,
  onOpenChange,
  instants,
  os,
  status,
  onOrganize
}: ShortcutSheetProps) {
  const { t } = useTranslation();
  const global = useGlobalShortcutSettings();
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const hasMenuBar = menuBridge() !== null;

  const query = filter.trim().toLowerCase();

  const allKeyed = instants
    .filter((instant): instant is Instant & { key: string } => Boolean(instant.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  const keyed = query
    ? allKeyed.filter(
        (instant) => instant.name.toLowerCase().includes(query) || instant.key === query
      )
    : allKeyed;
  const unkeyed = instants.length - allKeyed.length;

  const failure = (key: string) => status.failed.find((item) => item.key === key)?.reason;
  const unsupported = status.failed.some(({ reason }) => reason === "unsupported");
  const showCombo = global.available && global.enabled && global.modifier !== null;

  const mod = os === "mac" ? "⌘" : "Ctrl";
  const menus = {
    playback: t("menu.playback.title"),
    view: t("menu.view.title"),
    file: t("menu.file.title"),
    help: t("menu.help.title"),
    // On macOS Aparência lives in the app menu; elsewhere there is none.
    settings: os === "mac" ? t("shortcuts.sheet.menuApp") : t("menu.file.title")
  };

  const appKeys: AppKey[] = [
    { id: "stop", group: "play", keys: ["Esc"], label: t("shortcuts.sheet.stop"), menu: menus.playback },
    { id: "favorites", group: "navigate", keys: [mod, "1"], label: t("app.tabFavorites"), menu: menus.view },
    { id: "explore", group: "navigate", keys: [mod, "2"], label: t("app.tabExplore"), menu: menus.view },
    { id: "find", group: "navigate", keys: [mod, "F"], label: t("shortcuts.sheet.find"), menu: menus.view },
    { id: "reload", group: "navigate", keys: [mod, "R"], label: t("shortcuts.sheet.reload"), menu: menus.view, needsMenuBar: true },
    { id: "add", group: "add", keys: [mod, "N"], label: t("shortcuts.sheet.add"), menu: menus.file },
    { id: "appearance", group: "app", keys: [mod, ","], label: t("shortcuts.sheet.appearance"), menu: menus.settings, needsMenuBar: true },
    { id: "list", group: "app", keys: ["?"], label: t("shortcuts.sheet.list"), menu: menus.help }
  ];

  const groups: { id: AppKey["group"]; title: string }[] = [
    { id: "play", title: t("shortcuts.sheet.groupPlay") },
    { id: "navigate", title: t("shortcuts.sheet.groupNavigate") },
    { id: "add", title: t("shortcuts.sheet.groupAdd") },
    { id: "app", title: t("shortcuts.sheet.groupApp") }
  ];

  const visibleAppKeys = appKeys.filter(
    (row) =>
      (!row.needsMenuBar || hasMenuBar) &&
      (!query ||
        [row.label, row.menu, row.keys.join(" ")].some((text) => text.toLowerCase().includes(query)))
  );

  // "/" moves to the filter from anywhere in the sheet but a field, footer
  // included. Clip keys are ignored behind a dialog (overlayOpen), so it
  // cannot collide with one.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget(event.target)) {
        event.preventDefault();
        filterRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const noMatches = query !== "" && keyed.length === 0 && visibleAppKeys.length === 0;

  return (
    <Dialog
      wide
      open={open}
      onOpenChange={(next) => {
        if (!next) setFilter("");
        onOpenChange(next);
      }}
      title={t("shortcuts.sheet.title")}
      description={global.available ? t("shortcuts.global.lede") : t("shortcuts.sheet.lede")}
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t("shortcuts.sheet.close")}
        </Button>
      }
    >
      <div className="ksheet">
        <label className="ksheet__filter">
          <SearchIcon style={{ flex: "none" }} />
          <input
            ref={filterRef}
            type="text"
            autoFocus
            aria-label={t("shortcuts.sheet.filter")}
            placeholder={t("shortcuts.sheet.filter")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <Key>/</Key>
        </label>

        {allKeyed.length > 0 && !query && (
          <ul className="ksheet__legend" aria-label={t("shortcuts.sheet.legend")}>
            <li>
              <Key>A</Key>
              <span>{t("shortcuts.sheet.legendDiscord")}</span>
            </li>
            <li>
              <Keys parts={[os === "mac" ? "⇧" : "Shift", "A"]} />
              <span>{t("shortcuts.sheet.legendLocal")}</span>
            </li>
            <li>
              <Key>Esc</Key>
              <span>{t("shortcuts.sheet.legendStop")}</span>
            </li>
          </ul>
        )}

        {(!query || keyed.length > 0) && (
          <section className="ksheet__section" aria-label={t("shortcuts.sheet.yourSounds")}>
            <div className="ksheet__head">
              <h3 className="ksheet__h">{t("shortcuts.sheet.yourSounds")}</h3>
              <span className="ksheet__count">
                {allKeyed.length > 0
                  ? t("shortcuts.sheet.counts", { keyed: allKeyed.length, unkeyed })
                  : t("shortcuts.sheet.noneKeyed")}
              </span>
              {instants.length > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onOpenChange(false);
                    onOrganize();
                  }}
                >
                  {t("shortcuts.sheet.setInOrganize")}
                </Button>
              )}
            </div>

            {allKeyed.length === 0 ? (
              <p className="ksheet__note">{t("shortcuts.sheet.noneBody")}</p>
            ) : (
              <ul className="ksheet__list">
                {keyed.map((instant) => {
                  const reason = showCombo ? failure(instant.key) : undefined;
                  return (
                    <li key={instant.url} className="ksheet__row">
                      <span className={`ksheet__cap ${slotFor(instant.url)}`}>
                        {instant.key.toUpperCase()}
                      </span>
                      <span className="ksheet__name" title={instant.name}>
                        {instant.name}
                      </span>
                      {showCombo && global.modifier && (
                        <span
                          className="ksheet__combo"
                          aria-label={comboLabel(os, global.modifier, instant.key)}
                        >
                          <span className="ksheet__dot" data-status={reason ?? "ok"} aria-hidden="true" />
                          <Keys parts={comboParts(os, global.modifier, instant.key)} />
                          {reason && <span>· {t("shortcuts.global.inUse")}</span>}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {global.available && global.modifier && !query && (
          <section className="ksheet__section ksheet__global" aria-label={t("shortcuts.global.switch")}>
            <Switch
              label={t("shortcuts.global.switch")}
              checked={global.enabled}
              onCheckedChange={global.setEnabled}
            />
            <p className="ksheet__note">{t("shortcuts.global.switchHint")}</p>
            {global.enabled && (
              <div className="ksheet__field">
                <span>{t("shortcuts.global.modifier")}</span>
                <SegmentedChoice
                  aria-label={t("shortcuts.global.modifier")}
                  value={global.modifier}
                  onChange={global.setModifier}
                  options={global.modifiers.map((modifier) => ({
                    value: modifier,
                    label: comboLabel(os, modifier, "").replace(/\+$/, "")
                  }))}
                />
              </div>
            )}
            {showCombo && <p className="ksheet__note">{t("shortcuts.global.inUseNote")}</p>}
            {unsupported && <p className="ksheet__note">{t("shortcuts.global.unsupported")}</p>}
          </section>
        )}

        {visibleAppKeys.length > 0 && (
          <section className="ksheet__section" aria-label={t("shortcuts.sheet.inApp")}>
            <h3 className="ksheet__h">{t("shortcuts.sheet.inApp")}</h3>
            {groups.map((group) => {
              const rows = visibleAppKeys.filter((row) => row.group === group.id);
              return rows.length === 0 ? null : (
                <div key={group.id} className="ksheet__group">
                  <h4 className="ksheet__sub">{group.title}</h4>
                  <ul className="ksheet__list">
                    {rows.map((row) => (
                      <li key={row.id} className="ksheet__row">
                        <Keys parts={row.keys} />
                        <span className="ksheet__name">{row.label}</span>
                        {hasMenuBar && <span className="ksheet__menu">{row.menu}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        )}

        {noMatches && (
          <p className="ksheet__note" role="status">
            {t("shortcuts.sheet.noMatches", { filter: filter.trim() })}
          </p>
        )}
      </div>
    </Dialog>
  );
}
