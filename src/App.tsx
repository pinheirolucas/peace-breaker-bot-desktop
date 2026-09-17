import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Server } from "../electron/discovery";
import { sortServers } from "../electron/discovery";
import AddServerForm from "./AddServerForm";
import { AppearanceDock } from "./components/AppearanceDock";
import { AppearanceStage } from "./components/AppearanceStage";
import { Button, IconButton } from "./components/Button";
import { Menu, MenuItem, MenuSeparator } from "./components/Menu";
import { SearchField } from "./components/SearchField";
import { Segmented, SegmentedPanel, SegmentedRoot } from "./components/Segmented";
import { TitleBar } from "./components/TitleBar";
import { Toast, ToastProvider } from "./components/Toast";
import { TooltipProvider } from "./components/Tooltip";
import FavoritesPanel from "./FavoritesPanel";
import { useAppearance } from "./hooks/useAppearance";
import { useLanguage } from "./hooks/useLanguage";
import { useNativeChrome } from "./hooks/useNativeChrome";
import { findShortcutLabel, isFindShortcut, useChromeKind, usePlatform } from "./hooks/usePlatform";
import { useProvider } from "./hooks/useProvider";
import { useRegion } from "./hooks/useRegion";
import { useStamp } from "./hooks/useStamp";
import { CheckIcon, MoreIcon, PlusIcon } from "./icons";
import ImportForm from "./ImportForm";
import MyInstantsPanel from "./MyInstantsPanel";
import ProviderMenu from "./ProviderMenu";
import RegionMenu from "./RegionMenu";
import ServerMenu, { formatApiUrl } from "./ServerMenu";
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
import { useManualServers, useSelectedServer } from "./storage";
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

  // index.html stamps both pre-paint from the bridge; these keep them in
  // step with the dev overrides (?os=, ?chrome=), which it does not read.
  useStamp("os", os);
  useStamp("chrome", chrome);

  // After the mode and theme stamps above, so it reads the new palette.
  useNativeChrome(resolved, theme);

  const [tab, setTab] = useState<Tab>("favorites");
  const [summary, setSummary] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);

  const { region, setRegion } = useRegion();

  const [addOpen, setAddOpen] = useState(false);
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
  // falls through to today's behaviour — RegionMenu has always shown here —
  // rather than assuming the active provider doesn't support it.
  const regionSupported = provider ? provider.supportsRegion : true;

  const [toast, setToast] = useState<ToastState>({ open: false, key: 0, message: "" });

  const tabs = useMemo(
    () => [
      { value: "favorites" as const, label: t("app.tabFavorites") },
      { value: "explore" as const, label: t("app.tabExplore") }
    ],
    [t]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Per-platform: Cmd on macOS, where Ctrl+F moves the cursor forward a
      // character and is not a find at all. Not while Aparência is open: the
      // search sits in the staged app, behind the dock's focus trap.
      if (editing || !isFindShortcut(event, os)) {
        return;
      }

      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [os, editing]);

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

  return (
    <SnackbarContext.Provider value={snackbar}>
      <TooltipProvider>
        <ToastProvider>
          <SegmentedRoot value={tab} onChange={setTab} className="app">
            {chrome === "custom" && <TitleBar os={os} />}
            <AppearanceStage open={editing}>
              <header className="hero">
                <h1>{tab === "favorites" ? t("app.tabFavorites") : t("app.tabExplore")}</h1>
                <span className="count" aria-live="polite">
                  {summary}
                </span>
                <span className="spacer" />
                <Segmented aria-label={t("app.sectionAriaLabel")} options={tabs} />
              </header>

              <div className="tools">
                <SearchField
                  ref={searchRef}
                  aria-label={t("app.searchAriaLabel")}
                  placeholder={t("app.searchPlaceholder")}
                  shortcut={findShortcutLabel(os)}
                  value={query}
                  onChange={(event) => handleSearchChange(event.target.value)}
                />
                {tab === "favorites" && (
                  <Button onClick={() => setAddOpen(true)}>
                    <PlusIcon />
                    {t("app.add")}
                  </Button>
                )}
                {tab === "explore" && providers && provider && (
                  <ProviderMenu providers={providers} value={provider.key} onSelect={setProvider} />
                )}
                {tab === "explore" && regionSupported && (
                  <RegionMenu region={region} onSelect={setRegion} />
                )}
                <span className="spacer" />
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
                <Menu
                  trigger={
                    <IconButton label={t("app.moreOptions")}>
                      <MoreIcon />
                    </IconButton>
                  }
                >
                  <MenuItem primary={t("app.import")} onSelect={() => setImportOpen(true)} />
                  <MenuItem primary={t("app.export")} onSelect={() => exportToJSON()} />
                  <MenuSeparator />
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
  
              <main className="scroll">
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
