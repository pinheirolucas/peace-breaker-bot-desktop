import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { isSettingsPane, sectionFromHash, settingsSections } from "../electron/settings";
import type { SettingsPane, SettingsSection } from "../electron/settings";
import { ToastProvider, Toast } from "./components/Toast";
import { useColorMode } from "./hooks/useColorMode";
import { useCompact } from "./hooks/useCompact";
import { useLanguage } from "./hooks/useLanguage";
import { useNativeChrome } from "./hooks/useNativeChrome";
import { findShortcutLabel, useChromeKind, useDesktop, usePlatform } from "./hooks/usePlatform";
import { useStamp } from "./hooks/useStamp";
import { useTheme } from "./hooks/useTheme";
import {
  AppMarkIcon,
  ArrowUpRightIcon,
  CloseIcon,
  CompassIcon,
  DatabaseIcon,
  KeyboardIcon,
  PaletteIcon,
  SearchIcon,
  ServerIcon,
  SlidersIcon,
  WindowBarIcon
} from "./icons";
import ImportForm from "./ImportForm";
import { exportToJSON } from "./state";
import { resetSettings } from "./storage";
import type { PlatformId } from "./themes";
import { DataPane } from "./settings/DataSection";
import ExploreSection from "./settings/ExploreSection";
import GeneralSection from "./settings/GeneralSection";
import KeysSection from "./settings/KeysSection";
import PresenceSection from "./settings/PresenceSection";
import ServerSection from "./settings/ServerSection";
import { matchEntries, searchEntries, sectionLabel } from "./settings/search";
import "./settings/settings.css";

const icons: Record<SettingsSection, ReactNode> = {
  general: <SlidersIcon />,
  appearance: <PaletteIcon />,
  server: <ServerIcon />,
  explore: <CompassIcon />,
  keys: <KeyboardIcon size={18} />,
  presence: <WindowBarIcon />,
  data: <DatabaseIcon />
};

export interface SettingsShellProps {
  os: PlatformId;
  /** Below 720px: an icon rail, and the search moves to the top of the pane. */
  compact: boolean;
  section: SettingsPane;
  onSection: (section: SettingsPane) => void;
  /** Aparência is a launcher, not a pane: the stage it opens lives in the main window. */
  onOpenAppearance: () => void;
  query: string;
  onQuery: (query: string) => void;
  version: string;
  /** What each section shows; only the current one is ever mounted. */
  panes: Record<SettingsPane, ReactNode>;
  rootRef?: Ref<HTMLDivElement>;
}

/** The window's frame: the sidebar, the search, and the pane or the results. It knows nothing of what a section holds. */
export function SettingsShell({
  os,
  compact,
  section,
  onSection,
  onOpenAppearance,
  query,
  onQuery,
  version,
  panes,
  rootRef
}: SettingsShellProps) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const searching = query.trim() !== "";

  const entries = useMemo(() => searchEntries(t, os), [t, os]);
  const hits = useMemo(
    () => matchEntries(entries, query, (target) => sectionLabel(t, target, os)),
    [entries, query, t, os]
  );

  // Esc clears the search before anything else; the find key focuses it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = os === "mac" ? event.metaKey : event.ctrlKey;

      if (event.key === "Escape" && searching) {
        event.preventDefault();
        onQuery("");
      } else if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [os, searching, onQuery]);

  const searchField = (
    <label className="sfield">
      <SearchIcon size={14} />
      <input
        ref={searchRef}
        type="search"
        aria-label={t("settings.searchLabel")}
        placeholder={t("settings.searchPlaceholder")}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      {query ? (
        <button type="button" aria-label={t("settings.clearSearch")} onClick={() => onQuery("")}>
          <CloseIcon size={13} />
        </button>
      ) : (
        !compact && <span className="kb">{findShortcutLabel(os)}</span>
      )}
    </label>
  );

  function go(target: SettingsSection) {
    if (target === "appearance") {
      onOpenAppearance();
    } else {
      onQuery("");
      onSection(target);
    }
  }

  return (
    <div ref={rootRef} className={["settings", compact && "compact"].filter(Boolean).join(" ")}>
      <aside className="sside" aria-label={t("settings.sidebarLabel")}>
        <div className="stb">
          <AppMarkIcon size={16} />
          <span>{t("settings.title")}</span>
        </div>
        {!compact && searchField}

        {settingsSections.map((id) => {
          const label = sectionLabel(t, id, os);
          const launcher = id === "appearance";
          const current = !launcher && !searching && section === id;

          return (
            <button
              key={id}
              type="button"
              className="nav"
              aria-current={current ? "page" : undefined}
              aria-label={launcher ? t("settings.appearanceLauncher") : label}
              title={launcher ? t("settings.appearanceTitle") : label}
              onClick={() => go(id)}
            >
              {icons[id]}
              <span className="lbl">{label}</span>
              {launcher && <ArrowUpRightIcon className="ext" size={13} />}
            </button>
          );
        })}

        <div className="nsp" />
        <div className="sfoot">
          <b>{t("settings.footerName")}</b>
          {t("settings.footerVersion", { version })}
          <br />
          {t("settings.footerApplied")}
        </div>
      </aside>

      <main className="spane">
        <div className="phead">{compact && searchField}</div>
        <div className="sscroll">
          {searching ? (
            <>
              <h1>{t("settings.results")}</h1>
              <p className="slede">{t("settings.resultCount", { count: hits.length, query: query.trim() })}</p>
              {hits.length > 0 ? (
                <div className="grp" style={{ marginTop: 18 }}>
                  {hits.map((hit) => (
                    <button key={hit.id} type="button" className="hit" onClick={() => go(hit.section)}>
                      <span className="preftx">
                        <b>{hit.title}</b>
                        <span>{hit.hint}</span>
                      </span>
                      <span className="chip">
                        {sectionLabel(t, hit.section, os)}
                        {hit.section === "appearance" ? " ↗" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="sempty">
                  <b>{t("settings.noResults")}</b>
                  {t("settings.noResultsHint")}
                  <br />
                  <button type="button" className="btn btn--secondary" onClick={() => onQuery("")}>
                    {t("settings.clearSearch")}
                  </button>
                </div>
              )}
            </>
          ) : (
            panes[section]
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Configurações, the window. It is the same bundle as the main window at
 * #/settings, and it only ever WRITES stored values: the main window reads
 * them (storage events keep it current) and is the one that pushes shortcuts,
 * the tray and the menus to the main process. Nothing here mounts what does
 * that, or two windows would register the same keys.
 */
export default function Settings() {
  const { t } = useTranslation();
  const os = usePlatform();
  const chrome = useChromeKind();
  const desktop = useDesktop();

  useLanguage();
  const { theme } = useTheme();
  const { resolved } = useColorMode();

  useStamp("os", os);
  useStamp("desktop", desktop ?? "");
  useStamp("chrome", chrome);
  useNativeChrome(resolved, theme);

  const rootRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(rootRef);

  const [section, setSection] = useState<SettingsPane>(() => sectionFromHash(window.location.hash));
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState({ open: false, key: 0, message: "" });

  useEffect(() => {
    document.title = t("settings.title");
  }, [t]);

  // Opened again while already open: main says which section to show.
  useEffect(
    () =>
      window.instantsSettings?.onSection?.((next) => {
        if (isSettingsPane(next)) {
          setQuery("");
          setSection(next);
        }
      }),
    []
  );

  const openAppearance = () => {
    if (window.instantsSettings?.openAppearance) window.instantsSettings.openAppearance();
  };

  const panes: Record<SettingsPane, ReactNode> = {
    general: <GeneralSection />,
    server: <ServerSection />,
    explore: <ExploreSection />,
    keys: <KeysSection />,
    presence: <PresenceSection onOpenKeys={() => setSection("keys")} />,
    data: (
      <DataPane
        onExport={exportToJSON}
        onImport={() => setImportOpen(true)}
        onReset={() => {
          resetSettings();
          setToast((current) => ({ open: true, key: current.key + 1, message: t("settings.data.restored") }));
        }}
      />
    )
  };

  return (
    <ToastProvider>
      <SettingsShell
        rootRef={rootRef}
        os={os}
        compact={compact}
        section={section}
        onSection={setSection}
        onOpenAppearance={openAppearance}
        query={query}
        onQuery={setQuery}
        version={__APP_VERSION__}
        panes={panes}
      />
      <ImportForm open={importOpen} onClose={() => setImportOpen(false)} />
      <Toast
        key={toast.key}
        open={toast.open}
        onOpenChange={(open) => setToast((current) => ({ ...current, open }))}
        message={toast.message}
      />
    </ToastProvider>
  );
}
