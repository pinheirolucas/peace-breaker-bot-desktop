import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { emptyPresence } from "../electron/presence";
import type { PresenceSnapshot } from "../electron/presence";
import { escapeAction, panelMinHeight, panelSize } from "../electron/panel";
import { MenuItem, MenuLabel, MenuSeparator } from "./components/Menu";
import { PresenceStrip } from "./components/PresenceStrip";
import { PanelConnection, PanelFavorites } from "./components/QuickPanelViews";
import { Toast, ToastProvider } from "./components/Toast";
import { useAppearance } from "./hooks/useAppearance";
import { useClipShortcuts } from "./hooks/useClipShortcuts";
import type { ClipMode } from "./hooks/useClipShortcuts";
import { useLanguage } from "./hooks/useLanguage";
import { useMenuCommands } from "./hooks/useMenuBridge";
import { useChromeKind, useDesktop, usePlatform } from "./hooks/usePlatform";
import { usePresenceSettings, usePresenceSnapshot, useReportPlaying } from "./hooks/usePresence";
import { useServers } from "./hooks/useServers";
import { useStamp } from "./hooks/useStamp";
import { apiErrorMessage } from "./i18n/apiError";
import { CheckIcon } from "./icons";
import { cardState } from "./components/InstantCard";
import type { Playback } from "./components/InstantCard";
import { getContent } from "./service";
import SnackbarContext from "./SnackbarContext";
import type { SnackbarOptions } from "./SnackbarContext";
import { useInstantsState } from "./storage";
import type { Instant } from "./storage";
import useAudioPlayer from "./useAudioPlayer";
import useBotStatus from "./useBotStatus";
import useDiscordPlayer from "./useDiscordPlayer";

/** How long "Procurando…" is shown: discovery reports no end, so this is the answer window multicast usually needs. */
const SEARCH_MS = 2500;

const hintKey = "panelHintSeen";

function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(hintKey) === "1";
  } catch {
    return true;
  }
}

/**
 * Quick access's window content: `/?panel=1`, loaded by the panel's own
 * BrowserWindow. It is a second renderer, so it plays clips itself (hidden, it
 * keeps playing) and reports what it plays to main like the window does; what
 * it shows about the app comes from main's one snapshot.
 */
export default function QuickPanel() {
  const { t } = useTranslation();

  // Same palette, mode and language as the window; the values are shared through storage.
  useAppearance();
  useLanguage();
  useStamp("os", usePlatform());
  useStamp("desktop", useDesktop() ?? "");
  useStamp("chrome", useChromeKind());

  const { settings, setSettings } = usePresenceSettings();
  const { servers, activeUrl, healthy, select, refresh } = useServers();
  const botStatus = useBotStatus(activeUrl);
  const fromMain = usePresenceSnapshot();

  const [favorites] = useInstantsState([]);
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hint, setHint] = useState(() => !hintSeen());
  const [toast, setToast] = useState<SnackbarOptions & { open: boolean; key: number }>({
    open: false,
    key: 0,
    message: ""
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const names = useRef(new Map<string, string>());

  const [audioUrl, isAudioPlaying, playAudio, stopAudio] = useAudioPlayer();
  const [discordUrl, isDiscordPlaying, playDiscord, stopDiscord] = useDiscordPlayer();
  const anyPlaying = isAudioPlaying || isDiscordPlaying;

  const openSnackbar = useCallback(
    (options: SnackbarOptions) => setToast((current) => ({ ...options, open: true, key: current.key + 1 })),
    []
  );
  const snackbar = useMemo(
    () => ({ openSnackbar, closeSnackbar: () => setToast((current) => ({ ...current, open: false })) }),
    [openSnackbar]
  );

  // What this window plays, told to main; the panel's own strip reads main's answer.
  const playingMode = isDiscordPlaying ? "discord" : isAudioPlaying ? "local" : null;
  const playingUrl = playingMode === "discord" ? discordUrl : audioUrl;
  useReportPlaying(
    playingMode
      ? { mode: playingMode, name: names.current.get(playingUrl) ?? t("presence.someSound") }
      : null
  );

  useEffect(() => {
    window.instantsPresence?.setServer(activeUrl);
  }, [activeUrl]);

  // With no bridge (a browser tab on ?panel=1) there is no main to ask, so the strip is built here.
  const snapshot: PresenceSnapshot =
    fromMain ??
    ({
      ...emptyPresence,
      server: activeUrl,
      bot: botStatus,
      silent: Boolean(activeUrl) && !healthy,
      playing: playingMode
        ? { mode: playingMode, name: names.current.get(playingUrl) ?? "", since: 0 }
        : null
    } satisfies PresenceSnapshot);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? favorites.filter(({ name }) => name.toLowerCase().includes(needle)) : favorites;
  }, [favorites, query]);
  const matchUrl = query.trim() !== "" ? (filtered[0]?.url ?? null) : null;

  function playbackOf(instant: Instant): Playback {
    if (instant.url === audioUrl) return "local";
    if (instant.url === discordUrl) return "discord";
    return "idle";
  }

  async function handlePlay(instant: Instant) {
    let info;

    try {
      info = await getContent(instant.url);
    } catch (err) {
      openSnackbar({ message: apiErrorMessage(t, err) });
      return;
    }

    if (!info.exists) {
      openSnackbar({ message: t("common.instantGone") });
      return;
    }

    names.current.set(instant.url, instant.name);
    playAudio(instant.url, info.content);
  }

  async function handlePlayOnDiscord(instant: Instant) {
    names.current.set(instant.url, instant.name);
    const error = await playDiscord(instant.url);
    if (error) openSnackbar({ message: apiErrorMessage(t, error) });
  }

  async function handleStop() {
    if (isAudioPlaying) stopAudio();
    if (isDiscordPlaying) await stopDiscord().catch(() => {});
  }

  // The body plays here by default; the setting flips it to send, for mid-call use.
  const onBody = settings.panelClick === "discord" ? handlePlayOnDiscord : handlePlay;

  // What the tray's Stop and the strip's Stop send: main tells every window, this one included.
  useMenuCommands((command) => {
    if (command.type === "stop" && anyPlaying) void handleStop();
  });

  function stopEverywhere() {
    if (window.instantsPresence) {
      window.instantsPresence.stop();
    } else {
      void handleStop();
    }
  }

  function action(type: "hide" | "open-app" | "refresh" | "settings" | "quit") {
    window.instantsPanel?.action({ type });
  }

  // Favourite keys still fire from the panel: bare plays on Discord, Shift plays here.
  function triggerClip(key: string, mode: ClipMode) {
    const instant = favorites.find((item) => item.key === key);
    if (!instant) return;

    const playback = playbackOf(instant);
    const state = cardState(playback, anyPlaying && playback === "idle", botStatus);
    if (mode === "discord" ? state.discordDisabled : state.playDisabled) return;

    void (mode === "discord" ? handlePlayOnDiscord(instant) : handlePlay(instant));
  }

  const playingNow = anyPlaying || snapshot.playing !== null;

  // Esc, at the window: stop first, then a typed query, then the panel itself.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // An open menu closes on its own Esc first.
      if (document.querySelector('[role="menu"], [role="dialog"]')) return;

      event.preventDefault();
      const what = escapeAction({ playing: playingNow, query });

      if (what === "stop") stopEverywhere();
      else if (what === "clear") setQuery("");
      else action("hide");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // stopEverywhere and action only read state through refs and the bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingNow, query]);

  useClipShortcuts(settings.panelStyle === "favorites", {
    trigger: triggerClip,
    // Esc is the window listener's above.
    stop: () => false
  });

  // Every route in opens with the search focused, and re-runs the fade.
  useEffect(
    () =>
      window.instantsPanel?.onShown(() => {
        const root = rootRef.current;
        if (root) {
          root.classList.remove("is-shown");
          void root.offsetWidth;
          root.classList.add("is-shown");
        }
        setQuery("");
        searchRef.current?.focus();
        searchRef.current?.select();
      }),
    []
  );

  // Conexão hugs its content, between the panel's two heights; Favoritos is always the tall one.
  useEffect(() => {
    const bridge = window.instantsPanel;
    if (!bridge) return undefined;

    if (settings.panelStyle === "favorites") {
      bridge.action({ type: "resize", height: panelSize.height });
      return undefined;
    }

    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => {
      // The strip (56) and the footer (40) around the body.
      bridge.action({ type: "resize", height: Math.max(panelMinHeight, body.scrollHeight + 96 + 24) });
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [settings.panelStyle, servers.length]);

  function pin() {
    const next = !pinned;
    setPinned(next);
    window.instantsPanel?.action({ type: "pin", pinned: next });
  }

  function searchAgain() {
    setSearching(true);
    refresh();
    window.setTimeout(() => setSearching(false), SEARCH_MS);
  }

  function markHintSeen() {
    try {
      window.localStorage.setItem(hintKey, "1");
    } catch {
      // storage refused: the hint simply keeps showing
    }
    setHint(false);
  }

  const styleItem = (style: "favorites" | "connection", label: string) => (
    <MenuItem
      tick={settings.panelStyle === style ? <CheckIcon /> : null}
      primary={label}
      onSelect={() => setSettings({ ...settings, panelStyle: style })}
    />
  );

  const menu = (
    <>
      <MenuItem primary={t("presence.openApp")} onSelect={() => action("open-app")} />
      <MenuItem primary={t("presence.refresh")} onSelect={() => { refresh(); action("refresh"); }} />
      <MenuSeparator />
      <MenuLabel>{t("quickAccess.style")}</MenuLabel>
      {styleItem("favorites", t("quickAccess.styleFavorites"))}
      {styleItem("connection", t("quickAccess.styleConnection"))}
      <MenuSeparator />
      <MenuItem primary={t("menuBar.title")} onSelect={() => action("settings")} />
      <MenuItem primary={t("presence.quit")} onSelect={() => action("quit")} />
    </>
  );

  return (
    <SnackbarContext.Provider value={snackbar}>
      <ToastProvider>
        <div
          className="app panel"
          ref={rootRef}
          onPointerDownCapture={() => {
            // A drag out started here: the hint has done its job.
            if (hint) window.addEventListener("pointerup", markHintSeen, { once: true });
          }}
        >
          <PresenceStrip snapshot={snapshot} pinned={pinned} onStop={stopEverywhere} onPin={pin} menu={menu} />

          {settings.panelStyle === "connection" ? (
            <PanelConnection
              servers={servers}
              activeUrl={activeUrl}
              healthy={healthy}
              searching={searching}
              onSelect={select}
              onSearch={searchAgain}
              onOpenApp={() => action("open-app")}
              bodyRef={bodyRef}
            />
          ) : (
            <PanelFavorites
              instants={filtered}
              total={favorites.length}
              query={query}
              onQuery={setQuery}
              searchRef={searchRef}
              playbackOf={playbackOf}
              otherPlaying={anyPlaying}
              botStatus={botStatus}
              offline={snapshot.silent}
              onRetry={searchAgain}
              matchUrl={matchUrl}
              hint={hint}
              onPlay={onBody}
              onOpenApp={() => action("open-app")}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.target === searchRef.current && filtered[0]) {
                  event.preventDefault();
                  const first = filtered[0];
                  const state = cardState(playbackOf(first), anyPlaying && playbackOf(first) === "idle", botStatus);
                  const blocked = settings.panelClick === "discord" ? state.discordDisabled : state.playDisabled;
                  if (!blocked) void onBody(first);
                }
              }}
            />
          )}
        </div>

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
    </SnackbarContext.Provider>
  );
}
