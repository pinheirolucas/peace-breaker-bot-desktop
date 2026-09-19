import { useContext, useEffect, useState } from "react";
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
import InstantCard from "./components/InstantCard";
import type { Playback } from "./components/InstantCard";
import { OfflineBanner } from "./components/OfflineBanner";
import SortableInstantCard from "./components/SortableInstantCard";
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
}

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
  onPlayingChange
}: FavoritesPanelProps) {
  const { t } = useTranslation();
  const [audioUrl, isAudioPlaying, playAudio, stopAudio] = useAudioPlayer();
  const [discordUrl, isDiscordPlaying, playDiscord, stopDiscord] = useDiscordPlayer();
  const { openSnackbar, closeSnackbar } = useContext(SnackbarContext);
  const [instants, setInstants] = useInstantsState([]);

  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [overUrl, setOverUrl] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Instant | null>(null);

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
    if (organizing) {
      onSummary(t("favorites.organizeHint"));
      return;
    }

    onSummary(
      search
        ? t("favorites.filteredOfTotal", { filtered: filtered.length, total: instants.length })
        : t("favorites.savedCount", { count: instants.length })
    );
  }, [organizing, search, filtered.length, instants.length, onSummary, t]);

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

    playAudio(instant.url, info.content);
  }

  async function handlePlayOnDiscord(instant: Instant) {
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
      await stopDiscord();
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

  function handleRename(name: string) {
    if (!renaming) return;

    setInstants((current) =>
      current.map((instant) => (instant.url === renaming.url ? { ...instant, name } : instant))
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
                organize={{
                  position: index + 1,
                  total,
                  onRename: () => setRenaming(instant)
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
                onRename: () => undefined,
                drag: "overlay"
              }}
              trail={{ label: t("favorites.remove"), icon: <TrashIcon />, onClick: () => undefined }}
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
      <RenameForm instant={renaming} onCancel={() => setRenaming(null)} onSave={handleRename} />
    </>
  );
}
