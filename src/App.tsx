import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Server } from "../electron/discovery";
import { sortServers } from "../electron/discovery";
import AddMenu from "./AddMenu";
import AddServerForm from "./AddServerForm";
import { AppearanceDock } from "./components/AppearanceDock";
import { AppearanceStage } from "./components/AppearanceStage";
import { Button, IconButton } from "./components/Button";
import { Menu, MenuItem, MenuSeparator } from "./components/Menu";
import { SearchField } from "./components/SearchField";
import { Segmented, SegmentedPanel, SegmentedRoot } from "./components/Segmented";
import { Toast, ToastProvider } from "./components/Toast";
import { TooltipProvider } from "./components/Tooltip";
import FavoritesPanel from "./FavoritesPanel";
import FilterMenu, { FilterMenuItems, hasFilters } from "./FilterMenu";
import { useAppearance } from "./hooks/useAppearance";
import { useLanguage } from "./hooks/useLanguage";
import { useNativeChrome } from "./hooks/useNativeChrome";
import {
  findShortcutLabel,
  isFindShortcut,
  isModShortcut,
  shortcutLabel,
  useChromeKind,
  useDesktop,
  usePlatform
} from "./hooks/usePlatform";
import { DEFAULT_PROVIDER_NAME, useProvider } from "./hooks/useProvider";
import { useRegion } from "./hooks/useRegion";
import { useStamp } from "./hooks/useStamp";
import { useTier } from "./hooks/useTier";
import { AppMarkIcon, CheckIcon, MenuIcon, MoreIcon } from "./icons";
import ImportForm from "./ImportForm";
import MyInstantsPanel from "./MyInstantsPanel";
import ServerMenu, { botLine, formatApiUrl } from "./ServerMenu";
import {
  getApiUrl,
  isHealthy,
  onConnectionError,
  onHealthChange,
  resetApiUrl,
  setApiUrl
} from "./service";
import SnackbarContext from "./SnackbarContext";
import type { SnackbarOptions } from "./SnackbarContext";
import { exportToJSON } from "./state";
import { useInstantsState, useManualServers, useSelectedServer } from "./storage";
import useBotStatus from "./useBotStatus";
import useProviders from "./useProviders";
import "./styles/shell.css";

type Tab = "favorites" | "explore";

const SEARCH_DEBOUNCE = 300;

interface ToastState extends SnackbarOptions {
  open: boolean;
  /** Bumped on every show, so a repeat remounts the toast: a fresh timer,
   *  and a screen reader announces it again. */
  key: number;
}

export default function App() {
  const { t } = useTranslation();

  // Palette and colour mode, both stamped on <html>. Mode is auto by default
  // and follows the OS until the user picks a side. Both are changed in the
  // Aparência shell, which previews live and persists only on Pronto.
  const appearance = useAppearance();
  const { theme, resolved, editing } = appearance;

  const { language, setLanguage } = useLanguage();

  const os = usePlatform();
  const chrome = useChromeKind();
  const desktop = useDesktop();

  // index.html stamps all three pre-paint from the bridge; these keep them
  // in step with the dev overrides (?os=, ?desktop=, ?chrome=), which it
  // does not read.
  useStamp("os", os);
  useStamp("desktop", desktop ?? "");
  useStamp("chrome", chrome);

  // After the mode and theme stamps above, so it reads the new palette.
  useNativeChrome(resolved, theme);

  const appRef = useRef<HTMLDivElement>(null);
  const tier = useTier(appRef);

  const [tab, setTab] = useState<Tab>("favorites");
  const [summary, setSummary] = useState("");
  // Whether the grid has scrolled under the toolbar, which is when its lower
  // edge earns a line.
  const [scrolled, setScrolled] = useState(false);
  // Set by the overflow menu's server item, which closes that menu and then
  // opens the server picker: see the onCloseAutoFocus below.
  const openServerNext = useRef(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);

  const { region, setRegion } = useRegion();

  const [addOpen, setAddOpen] = useState(false);
  // Organizar belongs to Favoritos but its button sits in the tools row, next
  // to Adicionar — the same reason addOpen lives here.
  const [organizing, setOrganizing] = useState(false);
  const [favoritesPlaying, setFavoritesPlaying] = useState(false);
  const [favorites] = useInstantsState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [addServerOpen, setAddServerOpen] = useState(false);

  const [discovered, setDiscovered] = useState<Server[]>([]);
  const [manualServers, setManualServers] = useManualServers([]);
  const servers = useMemo(
    () => sortServers([...manualServers, ...discovered]),
    [manualServers, discovered]
  );
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useSelectedServer(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(getApiUrl());
  const [healthy, setHealthy] = useState<boolean>(isHealthy);
  const healthyRef = useRef<boolean>(isHealthy());
  const botStatus = useBotStatus(activeUrl);
  const providers = useProviders(activeUrl);
  const { provider, setProvider } = useProvider(providers);
  // Unknown (still loading, or an old backend with no /providers route)
  // falls through to today's behaviour — the region filter has always shown here —
  // rather than assuming the active provider doesn't support it.
  const regionSupported = provider ? provider.supportsRegion : true;

  const [toast, setToast] = useState<ToastState>({ open: false, key: 0, message: "" });

  const tabs = useMemo(
    () => [
      {
        value: "favorites" as const,
        label: t("app.tabFavorites"),
        title: `${t("app.tabFavorites")} ${shortcutLabel(os, "1")}`
      },
      {
        value: "explore" as const,
        label: t("app.tabExplore"),
        title: `${t("app.tabExplore")} ${shortcutLabel(os, "2")}`
      }
    ],
    [t, os]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Per-platform: Cmd on macOS, where Ctrl+F moves the cursor forward a
      // character and is not a find at all. None of them while Aparência is
      // open: the staged app is behind the dock's focus trap.
      if (editing) {
        return;
      }

      if (isFindShortcut(event, os)) {
        // With Organizar on, or no favourites to search, there is no field.
        if (searchRef.current) {
          event.preventDefault();
          searchRef.current.focus();
          searchRef.current.select();
        }
        return;
      }

      // Nor behind a dialog, which is modal.
      if (addOpen || importOpen || addServerOpen) {
        return;
      }

      if (isModShortcut(event, os, "1")) {
        event.preventDefault();
        setTab("favorites");
      } else if (isModShortcut(event, os, "2")) {
        event.preventDefault();
        setTab("explore");
      } else if (isModShortcut(event, os, "n") && tab === "favorites" && !organizing) {
        event.preventDefault();
        setAddOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [os, editing, organizing, tab, addOpen, importOpen, addServerOpen]);

  // With no favourites there is nothing on Favoritos to search, so the field
  // is left out. The query is shared with Explorar, so one left behind would
  // filter it with no field to show it.
  const showSearch = tab === "explore" || favorites.length > 0;

  useEffect(() => {
    if (!showSearch) {
      clearTimeout(debounce.current);
      setQuery("");
      setSearch("");
    }
  }, [showSearch]);

  // The page and its count are no longer drawn as a heading; the OS window
  // title (Mission Control, the taskbar, Alt+Tab) is where they live now.
  useEffect(() => {
    const page = tab === "favorites" ? t("app.tabFavorites") : t("app.tabExplore");
    document.title = summary ? `${page} — ${summary}` : page;
  }, [tab, summary, t]);

  // The mode is Favoritos' alone.
  useEffect(() => {
    if (tab !== "favorites") setOrganizing(false);
  }, [tab]);

  useEffect(() => () => clearTimeout(debounce.current), []);

  // Discovery is an upgrade, never a precondition: in a plain browser tab
  // there is no bridge at all, and that has to be a no-op.
  useEffect(() => {
    const discovery = window.instantsDiscovery;

    if (!discovery || typeof discovery.onServers !== "function") {
      return undefined;
    }

    const unsubscribe = discovery.onServers((next) => {
      setDiscovered(Array.isArray(next) ? (next as Server[]) : []);
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  useEffect(
    () =>
      onHealthChange((next: boolean) => {
        healthyRef.current = next;
        setHealthy(next);
      }),
    []
  );

  // Precedence: an explicit pick (re-validated, so a stale or malformed one
  // falls through), then the first discovered server — the list arrives
  // sorted, so that is stable across launches. With neither, there is no
  // fallback address: the app talks to nothing rather than assuming a
  // backend on localhost.
  useEffect(() => {
    if (!(selectedServer && setApiUrl(selectedServer))) {
      if (servers.length > 0) {
        setApiUrl(servers[0].apiUrl);
      } else {
        resetApiUrl();
      }
    }
    setActiveUrl(getApiUrl());
  }, [servers, selectedServer]);

  const showToast = useCallback((options: SnackbarOptions) => {
    setToast((current) => ({ ...options, open: true, key: current.key + 1 }));
  }, []);

  // Every failure, not only the transition, so a second failed click is
  // never silent. With no active server at all there is no address to name,
  // so that gets its own message rather than "Couldn't connect to ".
  useEffect(
    () =>
      onConnectionError(() => {
        const url = getApiUrl();

        showToast({
          message: url
            ? t("app.connectionError", { address: formatApiUrl(url) })
            : t("server.none"),
          actionLabel: t("common.switch"),
          onAction: () => setServerMenuOpen(true)
        });
      }),
    [showToast, t]
  );

  // Update checks happen in the main process (electron/updates.ts); this
  // only ever reacts to whichever event fits the platform. Windows applies
  // updates on its own and just needs a restart; macOS fetches the dmg
  // itself and needs a person to open it; Linux gets a plain heads-up, since
  // Electron's updater never covers it at all. A no-op outside Electron —
  // none of window.instantsUpdates exists in a plain browser tab.
  useEffect(() => {
    const updates = window.instantsUpdates;

    if (!updates || typeof updates.onAvailable !== "function") {
      return undefined;
    }

    const unsubscribers = [
      updates.onAvailable((version) =>
        showToast({
          message: t("update.available", { version }),
          actionLabel: t("update.viewOnGitHub"),
          onAction: () => updates.openReleasePage()
        })
      ),
      updates.onDownloaded(({ path }) =>
        showToast({
          message: t("update.ready"),
          actionLabel: t("update.open"),
          onAction: () => updates.openUpdate(path)
        })
      ),
      updates.onRestartReady(() =>
        showToast({
          message: t("update.restartReady"),
          actionLabel: t("update.restart"),
          onAction: () => updates.restart()
        })
      ),
      // Only ever fire in answer to a manual check — macOS's native app menu
      // or the overflow menu below on Windows/Linux — the hourly background
      // check stays silent either way, same as before either existed.
      updates.onNotAvailable(() => showToast({ message: t("update.upToDate") })),
      updates.onCheckFailed(() => showToast({ message: t("update.checkFailed") }))
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [showToast, t]);

  const openSnackbar = useCallback(
    (options: SnackbarOptions) => {
      // While unreachable, the connection toast is the accurate one — and a
      // panel's own generic error, whose catch always runs after it, would
      // otherwise clobber it.
      if (!healthyRef.current) {
        return;
      }

      showToast(options);
    },
    [showToast]
  );

  const closeSnackbar = useCallback(() => {
    setToast((current) => ({ ...current, open: false }));
  }, []);

  const snackbar = useMemo(
    () => ({ openSnackbar, closeSnackbar }),
    [openSnackbar, closeSnackbar]
  );

  function handleSearchChange(value: string) {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setSearch(value), SEARCH_DEBOUNCE);
  }

  function clearSearch() {
    clearTimeout(debounce.current);
    setQuery("");
    setSearch("");
  }

  function refreshDiscovery() {
    const discovery = window.instantsDiscovery;
    if (discovery && typeof discovery.refresh === "function") {
      discovery.refresh();
    }
  }

  function addManualServer(apiUrl: string) {
    if (!discovered.some((server) => server.apiUrl === apiUrl)) {
      setManualServers((current) =>
        current.some((server) => server.apiUrl === apiUrl)
          ? current
          : [
              ...current,
              {
                id: apiUrl,
                apiUrl,
                address: null,
                port: Number(new URL(apiUrl).port) || (apiUrl.startsWith("https:") ? 443 : 80),
                hostname: null,
                isLocal: false,
                manual: true
              }
            ]
      );
    }

    setSelectedServer(apiUrl);
    setAddServerOpen(false);
  }

  function removeManualServer(server: Server) {
    setManualServers((current) => current.filter((candidate) => candidate.id !== server.id));

    if (selectedServer === server.apiUrl) {
      setSelectedServer(null);
    }
  }

  // macOS gets a native item in its app menu instead — see
  // electron/main.ts's buildAppMenu — so this only needs to be offered here
  // on the platforms that have no menu bar of their own.
  function checkForUpdates() {
    const updates = window.instantsUpdates;
    if (updates && typeof updates.checkNow === "function") {
      updates.checkNow();
    }
  }

  const serverAddress = activeUrl ? formatApiUrl(activeUrl) : null;
  const openServerMenu = () => setServerMenuOpen(true);

  // The overflow menu is where a Tight window keeps the server: the chip is
  // out of the toolbar, and a badge on the menu button says when it needs
  // a look.
  const attention = Boolean(activeUrl) && (!healthy || botStatus?.connected === false);
  const serverStatus = !healthy ? t("server.notResponding") : botLine(healthy, botStatus, t);

  // Windows' caption buttons take 138px of a Tight toolbar, which leaves the
  // tabs, a magnifier and the overflow menu: what Adicionar's menu and the
  // Explorar filter hold go into that menu instead.
  const foldActions = os === "win" && tier === "tight";

  const filterProps = {
    providers,
    provider,
    onProvider: setProvider,
    regionSupported,
    region,
    onRegion: setRegion
  };

  const organizeBlockedReason = favoritesPlaying
    ? t("favorites.organizeBlockedPlaying")
    : query
      ? t("favorites.organizeBlockedSearch")
      : null;

  return (
    <SnackbarContext.Provider value={snackbar}>
      <TooltipProvider>
        <ToastProvider>
          <SegmentedRoot value={tab} onChange={setTab} className="app" rootRef={appRef}>
            <AppearanceStage open={editing}>
              <header
                className="toolbar"
                data-tab={tab}
                data-scrolled={scrolled || undefined}
                data-organizing={organizing || undefined}
              >
                <div className="toolbar__start">
                  {os === "win" && chrome === "custom" && (
                    <span className="toolbar__brand" aria-hidden="true">
                      <AppMarkIcon />
                      <span className="toolbar__name">Peace Breaker Bot</span>
                    </span>
                  )}
                  <Segmented aria-label={t("app.sectionAriaLabel")} options={tabs} />
                </div>

                <div className="toolbar__center">
                  {organizing ? (
                    <span className="toolbar__hint" aria-hidden="true">
                      {summary}
                    </span>
                  ) : showSearch ? (
                    <div className="capsule">
                      {tab === "explore" && !foldActions && <FilterMenu {...filterProps} />}
                      <SearchField
                        ref={searchRef}
                        aria-label={t("app.searchAriaLabel")}
                        placeholder={
                          tab === "favorites"
                            ? t("app.searchInFavorites", { count: favorites.length })
                            : t("app.searchInProvider", {
                                provider: provider?.name ?? DEFAULT_PROVIDER_NAME
                              })
                        }
                        shortcut={findShortcutLabel(os)}
                        value={query}
                        onChange={(event) => handleSearchChange(event.target.value)}
                      />
                    </div>
                  ) : null}
                  {/* The count that used to be the hero's second line. It is
                      still announced; it is drawn only in the window title. */}
                  <span className="sr-only" aria-live="polite">
                    {summary}
                  </span>
                </div>

                <div className="toolbar__end">
                  {tab === "favorites" && organizing && (
                    <Button
                      className="done"
                      aria-label={t("favorites.organizeDone")}
                      onClick={() => setOrganizing(false)}
                    >
                      <CheckIcon />
                      <span className="lbl">{t("favorites.organizeDone")}</span>
                    </Button>
                  )}
                  {tab === "favorites" && !organizing && !foldActions && (
                    <AddMenu
                      onAdd={() => setAddOpen(true)}
                      onOrganize={() => setOrganizing(true)}
                      onImport={() => setImportOpen(true)}
                      onExport={() => exportToJSON()}
                      canOrganize={favorites.length > 0}
                      organizeBlockedReason={organizeBlockedReason}
                      shortcut={shortcutLabel(os, "n")}
                    />
                  )}
                  <div className="toolbar__chip">
                    <ServerMenu
                      servers={servers}
                      currentApiUrl={activeUrl}
                      healthy={healthy}
                      botStatus={botStatus}
                      open={serverMenuOpen}
                      onOpenChange={setServerMenuOpen}
                      onSelect={(server) => setSelectedServer(server.apiUrl)}
                      onRefresh={refreshDiscovery}
                      onAddServer={() => setAddServerOpen(true)}
                      onRemoveServer={removeManualServer}
                    />
                  </div>
                  <div className="toolbar__more">
                    <Menu
                      className={foldActions && tab === "explore" ? "menu--scroll" : undefined}
                      onCloseAutoFocus={(event) => {
                        // The server item closes this menu to open the
                        // picker. Focus going back to the button in between
                        // would dismiss the picker the moment it opens.
                        if (openServerNext.current) {
                          event.preventDefault();
                          openServerNext.current = false;
                          setServerMenuOpen(true);
                        }
                      }}
                      trigger={
                        <IconButton label={t("app.moreOptions")} data-attention={attention ? (healthy ? "bot" : "down") : undefined}>
                          {os === "linux" ? <MenuIcon /> : <MoreIcon />}
                        </IconButton>
                      }
                    >
                      {foldActions && tab === "favorites" && (
                        <>
                          <MenuItem
                            primary={t("app.add")}
                            secondary={shortcutLabel(os, "n")}
                            onSelect={() => setAddOpen(true)}
                          />
                          {favorites.length > 0 && (
                            <MenuItem
                              primary={t("favorites.organize")}
                              secondary={organizeBlockedReason ?? undefined}
                              disabled={organizeBlockedReason !== null}
                              onSelect={() => setOrganizing(true)}
                            />
                          )}
                          <MenuItem primary={t("app.import")} onSelect={() => setImportOpen(true)} />
                          <MenuItem primary={t("app.export")} onSelect={() => exportToJSON()} />
                          <MenuSeparator />
                        </>
                      )}
                      {foldActions && tab === "explore" && hasFilters(filterProps) && (
                        <>
                          <FilterMenuItems {...filterProps} />
                          <MenuSeparator />
                        </>
                      )}
                      {tier === "tight" && (
                        <>
                          <MenuItem
                            tick={
                              <span
                                className="dot"
                                data-healthy={healthy}
                                data-bot-away={healthy && botStatus?.connected === false}
                              />
                            }
                            primary={serverAddress ?? t("server.none")}
                            secondary={serverStatus ?? undefined}
                            onSelect={() => {
                              openServerNext.current = true;
                            }}
                          />
                          <MenuSeparator />
                        </>
                      )}
                      <MenuItem primary={t("app.appearance")} onSelect={appearance.begin} />
                      <MenuSeparator />
                      <MenuItem
                        tick={language === "pt-BR" ? <CheckIcon /> : null}
                        primary={t("app.languagePtBR")}
                        onSelect={() => setLanguage("pt-BR")}
                      />
                      <MenuItem
                        tick={language === "en-US" ? <CheckIcon /> : null}
                        primary={t("app.languageEnUS")}
                        onSelect={() => setLanguage("en-US")}
                      />
                      {os !== "mac" && (
                        <>
                          <MenuSeparator />
                          <MenuItem primary={t("app.checkForUpdates")} onSelect={checkForUpdates} />
                        </>
                      )}
                    </Menu>
                  </div>
                </div>
              </header>

              <main
                className="scroll"
                onScroll={(event) => {
                  const next = event.currentTarget.scrollTop > 4;
                  setScrolled((current) => (current === next ? current : next));
                }}
              >
                <SegmentedPanel value="favorites">
                  <FavoritesPanel
                    search={search}
                    healthy={healthy}
                    botStatus={botStatus}
                    serverAddress={serverAddress}
                    onSwitchServer={openServerMenu}
                    onSummary={setSummary}
                    addOpen={addOpen}
                    onAddOpenChange={setAddOpen}
                    onSearchCatalog={() => setTab("explore")}
                    organizing={organizing}
                    onOrganizingChange={setOrganizing}
                    onPlayingChange={setFavoritesPlaying}
                  />
                </SegmentedPanel>
                <SegmentedPanel value="explore">
                  <MyInstantsPanel
                    search={search}
                    region={region}
                    provider={provider ?? undefined}
                    healthy={healthy}
                    botStatus={botStatus}
                    serverAddress={serverAddress}
                    onSwitchServer={openServerMenu}
                    onSummary={setSummary}
                    onClearSearch={clearSearch}
                  />
                </SegmentedPanel>
              </main>
            </AppearanceStage>

            {editing && (
              <AppearanceDock
                theme={appearance.theme}
                mode={appearance.mode}
                resolved={resolved}
                onThemeChange={(next) => appearance.preview({ theme: next })}
                onModeChange={(next) => appearance.preview({ mode: next })}
                onCancel={appearance.cancel}
                onConfirm={appearance.commit}
              />
            )}
          </SegmentedRoot>

          <ImportForm open={importOpen} onClose={() => setImportOpen(false)} />

          <AddServerForm
            open={addServerOpen}
            onCancel={() => setAddServerOpen(false)}
            onAdd={addManualServer}
          />

          <Toast
            key={toast.key}
            open={toast.open}
            onOpenChange={(open) => setToast((current) => ({ ...current, open }))}
            message={toast.message}
            actionLabel={toast.actionLabel}
            onAction={toast.onAction}
            duration={toast.duration}
          />
        </ToastProvider>
      </TooltipProvider>
    </SnackbarContext.Provider>
  );
}
