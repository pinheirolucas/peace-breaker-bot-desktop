import { useContext, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import type {
  Announcements,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import InstantCard, { cardState } from "./components/InstantCard";
import type { Playback } from "./components/InstantCard";
import { OfflineBanner } from "./components/OfflineBanner";
import ShortcutDialog from "./components/ShortcutDialog";
import SortableInstantCard from "./components/SortableInstantCard";
import { useClipShortcuts } from "./hooks/useClipShortcuts";
import type { ClipMode } from "./hooks/useClipShortcuts";
import { useGlobalShortcuts, useGlobalShortcutSettings } from "./hooks/useGlobalShortcuts";
import { useMenuCommands } from "./hooks/useMenuBridge";
import { comboLabel, usePlatform } from "./hooks/usePlatform";
import { assignKey } from "./lib/clipKeys";
import type { ShortcutResult } from "../electron/shortcuts";
import { TrashIcon } from "./icons";
import { apiErrorMessage } from "./i18n/apiError";
import RenameForm from "./RenameForm";
import SaveForm from "./SaveForm";
import SnackbarContext from "./SnackbarContext";
import { getContent } from "./service";
import type { BotStatus } from "./service";
import { useInstantsState } from "./storage";
import type { Instant } from "./storage";
import useAudioPlayer from "./useAudioPlayer";
import useDiscordPlayer from "./useDiscordPlayer";

const noop = () => undefined;

/** What the command palette asks of the panel that owns both players: the same checks a card's own buttons make. */
export interface FavoritesControls {
  /** Plays a favourite as its card would, and refuses where the card refuses. */
  play: (url: string, mode: ClipMode) => "played" | "none" | "busy" | "bot-away";
  /** Stops whatever plays. False when nothing did. */
  stop: () => boolean;
}

export interface FavoritesPanelProps {
  search: string;
  healthy: boolean;
  /** null means unknown — see useBotStatus. Threaded straight to each
   *  card, which is the only thing that gates on it. */
  botStatus: BotStatus | null;
  serverAddress: string | null;
  onSwitchServer: () => void;
  /** The hero's count line: "12 sons salvos", or "3 de 12" while searching. */
  onSummary: (summary: string) => void;
  /** The add form is opened from the tools row, outside this panel. */
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  /** Carry a search that matched no favourite over to the catalogue. */
  onSearchCatalog: () => void;
  /** Organizar: the card body drags instead of playing, and the footer
   *  swaps send and stop for rename. The button lives in the tools row. */
  organizing: boolean;
  onOrganizingChange: (organizing: boolean) => void;
  /** Whether a clip is playing — the tools row blocks Organizar while one is. */
  onPlayingChange: (playing: boolean) => void;
  /** Which path is playing, for the menu bar's Parar reprodução. */
  /** `name` is the clip that plays, for the tray and quick access; null when unknown. */
  onPlaybackChange?: (playback: "local" | "discord" | null, name: string | null) => void;
  /** False while hidden on Explorar, so it doesn't overwrite that tab's summary. Defaults to true. */
  active?: boolean;
  onGlobalStatus?: (status: ShortcutResult) => void;
  onGlobalSetupFailed?: (count: number) => void;
  /** Filled with this panel's controls, for the command palette. */
  controlsRef?: MutableRefObject<FavoritesControls | null>;
}

const FLASH_MS = { press: 120, refuse: 320 } as const;

const NOTIFY_EVERY_MS = 30_000;

export default function FavoritesPanel({
  search,
  healthy,
  botStatus,
  serverAddress,
  onSwitchServer,
  onSummary,
  addOpen,
  onAddOpenChange,
  onSearchCatalog,
  organizing,
  onOrganizingChange,
  onPlayingChange,
  onPlaybackChange,
  active = true,
  onGlobalStatus,
  onGlobalSetupFailed,
  controlsRef
}: FavoritesPanelProps) {
  const { t } = useTranslation();
  const os = usePlatform();
  const globalSettings = useGlobalShortcutSettings();
  // The player hooks know a clip by its url; the tray shows its name.
  const names = useRef(new Map<string, string>());
  const [audioUrl, isAudioPlaying, playAudio, stopAudio] = useAudioPlayer();
  const [discordUrl, isDiscordPlaying, playDiscord, stopDiscord] = useDiscordPlayer();
  const { openSnackbar, closeSnackbar } = useContext(SnackbarContext);
  const [instants, setInstants] = useInstantsState([]);

  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [overUrl, setOverUrl] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ instant: Instant; cardWidth: number } | null>(null);
  const [keying, setKeying] = useState<Instant | null>(null);
  const [flash, setFlash] = useState<{ url: string; kind: "press" | "refuse"; n: number } | null>(
    null
  );
  const [announcement, setAnnouncement] = useState("");
  const [globalStatus, setGlobalStatus] = useState<ShortcutResult>({ registered: [], failed: [] });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastNotified = useRef(0);

  // A drag needs 5px of travel, so a click on a footer button or a stray
  // press never starts one. Space/Enter lift by keyboard, arrows move.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const query = search.toLowerCase();
  const filtered = query
    ? instants.filter(({ name }) => name.toLowerCase().includes(query))
    : instants;

  useEffect(() => {
    if (!active) return;

    if (organizing) {
      onSummary(t("favorites.organizeHint"));
      return;
    }

    onSummary(
      search
        ? t("favorites.filteredOfTotal", { filtered: filtered.length, total: instants.length })
        : t("favorites.savedCount", { count: instants.length })
    );
  }, [active, organizing, search, filtered.length, instants.length, onSummary, t]);

  // Removing the last favourite leaves nothing to organize.
  useEffect(() => {
    if (organizing && instants.length === 0) {
      onOrganizingChange(false);
    }
  }, [organizing, instants.length, onOrganizingChange]);

  // Esc with nothing lifted and no dialog open leaves the mode. A lifted
  // card's own Esc (dnd-kit) and the rename dialog's (Radix) both come first.
  useEffect(() => {
    if (!organizing) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && activeUrl === null && !renaming) {
        onOrganizingChange(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [organizing, activeUrl, renaming, onOrganizingChange]);

  function handleRemove(instant: Instant) {
    setInstants((current) => current.filter(({ url }) => url !== instant.url));
  }

  function showNotFound(instant: Instant, message: string) {
    openSnackbar({
      message,
      actionLabel: t("favorites.remove"),
      onAction: () => {
        handleRemove(instant);
        closeSnackbar();
      }
    });
  }

  async function handlePlay(instant: Instant) {
    let info;

    try {
      info = await getContent(instant.url);
    } catch (err) {
      // Without this catch the rejection is unhandled inside a click
      // handler, and a failed play does and says nothing at all.
      openSnackbar({ message: apiErrorMessage(t, err) });
      return;
    }

    if (!info.exists) {
      showNotFound(instant, t("common.instantGone"));
      return;
    }

    names.current.set(instant.url, instant.name);
    playAudio(instant.url, info.content);
  }

  async function handlePlayOnDiscord(instant: Instant) {
    names.current.set(instant.url, instant.name);
    const error = await playDiscord(instant.url);
    if (error) {
      showNotFound(instant, apiErrorMessage(t, error));
    }
  }

  async function handleStop() {
    if (isAudioPlaying) {
      stopAudio();
    }

    if (isDiscordPlaying) {
      // The tray's Stop asks the endpoint itself as well, so the second answer may be a refusal.
      await stopDiscord().catch(() => {});
    }
  }

  function flashCard(url: string, kind: "press" | "refuse") {
    clearTimeout(flashTimer.current);
    setFlash((current) => ({ url, kind, n: (current?.n ?? 0) + 1 }));
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS[kind]);
  }

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  function triggerClip(key: string, mode: ClipMode): "played" | "none" | "busy" | "bot-away" {
    const instant = instants.find((item) => item.key === key);
    return instant ? triggerInstant(instant, mode) : "none";
  }

  function triggerInstant(instant: Instant, mode: ClipMode): "played" | "none" | "busy" | "bot-away" {

    const playback = playbackOf(instant);
    const state = cardState(playback, anyPlaying && playback === "idle", botStatus);
    const refused = mode === "discord" ? state.discordDisabled : state.playDisabled;

    if (refused) {
      flashCard(instant.url, "refuse");
      // Unknown status is never "out of the channel".
      if (mode === "discord" && state.botGated) {
        setAnnouncement(t("shortcuts.botAway"));
        return "bot-away";
      }
      setAnnouncement(t("shortcuts.busy"));
      return "busy";
    }

    flashCard(instant.url, "press");
    setAnnouncement(
      t(mode === "discord" ? "shortcuts.playingDiscord" : "shortcuts.playingLocal", {
        name: instant.name
      })
    );

    if (mode === "discord") {
      void handlePlayOnDiscord(instant);
    } else {
      void handlePlay(instant);
    }
    return "played";
  }

  function stopFromKeyboard(): boolean {
    if (!anyPlaying) return false;

    void handleStop();
    setAnnouncement(t("shortcuts.stopped"));
    return true;
  }

  if (controlsRef) {
    controlsRef.current = {
      play: (url, mode) => {
        const instant = instants.find((item) => item.url === url);
        // Organizar takes the keys off, and the palette with them.
        return instant && !organizing ? triggerInstant(instant, mode) : "none";
      },
      stop: stopFromKeyboard
    };
  }

  useClipShortcuts(!organizing, {
    trigger: (key, mode) => {
      if (triggerClip(key, mode) === "bot-away") {
        openSnackbar({ message: t("shortcuts.botAway") });
      }
    },
    stop: stopFromKeyboard
  });

  useGlobalShortcuts({
    keys: instants.flatMap(({ key }) => (key ? [key] : [])),
    onFire: (key) => {
      if (triggerClip(key, "discord") !== "bot-away") return;

      // Only "bot not in a channel" is worth a notification while unfocused.
      const now = Date.now();
      if (
        now - lastNotified.current >= NOTIFY_EVERY_MS &&
        typeof Notification !== "undefined" &&
        Notification.permission !== "denied"
      ) {
        lastNotified.current = now;
        new Notification(t("shortcuts.botAway"));
      }
    },
    onStatus: (status) => {
      setGlobalStatus(status);
      onGlobalStatus?.(status);
    },
    onSetupFailed: (count) => onGlobalSetupFailed?.(count)
  });

  function handleSetKey(key: string | null) {
    if (!keying) return;

    const { instants: next, displaced } = assignKey(instants, keying.url, key);
    setInstants(next);
    const target = keying;
    setKeying(null);

    if (key !== null && displaced) {
      openSnackbar({
        message: t("shortcuts.moved", {
          key: key.toUpperCase(),
          name: target.name,
          other: displaced.name
        }),
        actionLabel: t("shortcuts.undo"),
        onAction: () => {
          setInstants((current) =>
            current.map((item) =>
              item.url === target.url
                ? { ...item, key: target.key }
                : item.url === displaced.url
                  ? { ...item, key: displaced.key }
                  : item
            )
          );
          closeSnackbar();
        }
      });
    }
  }

  function handleSave(name: string, url: string) {
    const found = instants.find((instant) => instant.url === url);
    if (found) {
      openSnackbar({ message: t("favorites.duplicate", { name: found.name }) });
      return;
    }

    setInstants([...instants, { name, url }]);
    onAddOpenChange(false);
  }

  function playbackOf(instant: Instant): Playback {
    if (instant.url === audioUrl) return "local";
    if (instant.url === discordUrl) return "discord";
    return "idle";
  }

  const anyPlaying = isAudioPlaying || isDiscordPlaying;

  useEffect(() => {
    onPlayingChange(anyPlaying);
  }, [anyPlaying, onPlayingChange]);

  const playbackNow = isDiscordPlaying ? "discord" : isAudioPlaying ? "local" : null;

  const playingName =
    playbackNow === null ? null : (names.current.get(playbackNow === "discord" ? discordUrl : audioUrl) ?? null);

  useEffect(() => {
    onPlaybackChange?.(playbackNow, playingName);
  }, [playbackNow, playingName, onPlaybackChange]);

  // The right-click menu and the menu bar run the same handlers the buttons
  // do, re-checked against cardState now: the menu may have been open while
  // playback changed underneath it.
  useMenuCommands((command) => {
    if (command.type === "stop") {
      if (anyPlaying) void handleStop();
      return;
    }

    if (command.type !== "card" || command.surface !== "favorites") return;

    const index = instants.findIndex(({ url }) => url === command.url);
    if (index < 0) return;

    const instant = instants[index];
    const playback = organizing ? "idle" : playbackOf(instant);
    const state = cardState(playback, anyPlaying && playback === "idle", botStatus);

    switch (command.action) {
      case "play":
        if (!state.playDisabled) void handlePlay(instant);
        break;
      case "discord":
        if (!state.discordDisabled) void handlePlayOnDiscord(instant);
        break;
      case "stop":
        void handleStop();
        break;
      case "rename":
        setRenaming({ instant, cardWidth: command.width });
        break;
      case "set-key":
        setKeying(instant);
        break;
      case "move-start":
      case "move-end": {
        const to = command.action === "move-start" ? 0 : instants.length - 1;
        setInstants((current) => {
          const from = current.findIndex(({ url }) => url === command.url);
          return from < 0 ? current : arrayMove(current, from, to);
        });
        break;
      }
      case "remove":
        if (!state.trailDisabled) handleRemove(instant);
        break;
    }
  });

  function cardMenu(instant: Instant) {
    return {
      surface: "favorites" as const,
      index: instants.indexOf(instant),
      total: instants.length,
      favorite: true,
      providerName: ""
    };
  }

  function handleRename(name: string) {
    if (!renaming) return;

    setInstants((current) =>
      current.map((instant) =>
        instant.url === renaming.instant.url ? { ...instant, name } : instant
      )
    );
    setRenaming(null);
  }

  const total = instants.length;
  const indexOf = (id: string | number) => instants.findIndex(({ url }) => url === id);
  const nameOf = (id: string | number) => instants[indexOf(id)]?.name ?? "";

  const announcements: Announcements = {
    onDragStart: ({ active }: DragStartEvent) =>
      t("dnd.lifted", { name: nameOf(active.id), pos: indexOf(active.id) + 1, total }),
    onDragOver: ({ over }: DragOverEvent) =>
      over ? t("dnd.moved", { pos: indexOf(over.id) + 1, total }) : undefined,
    onDragEnd: ({ active, over }: DragEndEvent) =>
      t("dnd.dropped", {
        name: nameOf(active.id),
        pos: (over ? indexOf(over.id) : indexOf(active.id)) + 1,
        total
      }),
    onDragCancel: () => t("dnd.cancelled")
  };

  function handleDragStart({ active }: DragStartEvent) {
    setActiveUrl(String(active.id));
    setOverUrl(String(active.id));
  }

  function handleDragOver({ over }: DragOverEvent) {
    if (over) setOverUrl(String(over.id));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveUrl(null);
    setOverUrl(null);

    if (over && active.id !== over.id) {
      setInstants((current) => {
        const from = current.findIndex(({ url }) => url === active.id);
        const to = current.findIndex(({ url }) => url === over.id);
        return from < 0 || to < 0 ? current : arrayMove(current, from, to);
      });
    }
  }

  function handleDragCancel() {
    setActiveUrl(null);
    setOverUrl(null);
  }

  let content;

  if (instants.length === 0) {
    content = (
      <EmptyState
        title={t("favorites.emptyTitle")}
        body={t("favorites.emptyBody")}
        action={<Button onClick={() => onAddOpenChange(true)}>{t("favorites.addFirst")}</Button>}
      />
    );
  } else if (organizing) {
    const activeInstant = instants.find(({ url }) => url === activeUrl);

    content = (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("dnd.instructions") }
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={instants.map(({ url }) => url)} strategy={rectSortingStrategy}>
          <div className="grid" data-offline={!healthy}>
            {instants.map((instant, index) => (
              <SortableInstantCard
                key={instant.url}
                instant={instant}
                playback="idle"
                otherPlaying={false}
                botStatus={botStatus}
                onPlay={handlePlay}
                onPlayOnDiscord={handlePlayOnDiscord}
                onStop={handleStop}
                menu={cardMenu(instant)}
                organize={{
                  position: index + 1,
                  total,
                  onRename: (cardWidth) => setRenaming({ instant, cardWidth }),
                  onSetKey: () => setKeying(instant)
                }}
                trail={{
                  label: t("favorites.remove"),
                  icon: <TrashIcon />,
                  onClick: () => handleRemove(instant)
                }}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeInstant && (
            <InstantCard
              instant={activeInstant}
              playback="idle"
              otherPlaying={false}
              botStatus={botStatus}
              onPlay={handlePlay}
              onPlayOnDiscord={handlePlayOnDiscord}
              onStop={handleStop}
              organize={{
                position: (overUrl ? indexOf(overUrl) : indexOf(activeInstant.url)) + 1,
                total,
                onRename: noop,
                drag: "overlay"
              }}
              trail={{ label: t("favorites.remove"), icon: <TrashIcon />, onClick: noop }}
            />
          )}
        </DragOverlay>
      </DndContext>
    );
  } else if (filtered.length === 0) {
    // Carries the query to the other tab instead of making them retype it.
    content = (
      <EmptyState
        title={t("common.nothingHere")}
        body={t("favorites.noResultsBody", { count: instants.length, search })}
        action={
          <Button variant="secondary" onClick={onSearchCatalog}>
            {t("favorites.searchCatalogButton", { search })}
          </Button>
        }
      />
    );
  } else {
    content = (
      <div className="grid" data-offline={!healthy}>
        {filtered.map((instant) => {
          const playback = playbackOf(instant);
          return (
            <InstantCard
              key={instant.url}
              instant={instant}
              playback={playback}
              otherPlaying={anyPlaying && playback === "idle"}
              botStatus={botStatus}
              onPlay={handlePlay}
              onPlayOnDiscord={handlePlayOnDiscord}
              onStop={handleStop}
              menu={cardMenu(instant)}
              shortcut={{ flash: flash?.url === instant.url ? flash.kind : undefined }}
              trail={{
                label: t("favorites.remove"),
                icon: <TrashIcon />,
                onClick: () => handleRemove(instant)
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <>
      {!healthy && <OfflineBanner address={serverAddress} onSwitch={onSwitchServer} />}
      {content}
      <SaveForm open={addOpen} onCancel={() => onAddOpenChange(false)} onSave={handleSave} />
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <ShortcutDialog
        instant={keying}
        instants={instants}
        global={
          globalSettings.available && globalSettings.enabled && globalSettings.modifier
            ? {
                combo: (key) => comboLabel(os, globalSettings.modifier!, key),
                inUse: (key) => globalStatus.failed.some((item) => item.key === key)
              }
            : undefined
        }
        onCancel={() => setKeying(null)}
        onSave={handleSetKey}
      />
      <RenameForm
        instant={renaming?.instant ?? null}
        cardWidth={renaming?.cardWidth}
        onCancel={() => setRenaming(null)}
        onSave={handleRename}
      />
    </>
  );
}
