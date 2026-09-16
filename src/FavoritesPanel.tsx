import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import InstantCard from "./components/InstantCard";
import type { Playback } from "./components/InstantCard";
import { OfflineBanner } from "./components/OfflineBanner";
import { TrashIcon } from "./icons";
import { apiErrorMessage } from "./i18n/apiError";
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
  onSearchCatalog
}: FavoritesPanelProps) {
  const { t } = useTranslation();
  const [audioUrl, isAudioPlaying, playAudio, stopAudio] = useAudioPlayer();
  const [discordUrl, isDiscordPlaying, playDiscord, stopDiscord] = useDiscordPlayer();
  const { openSnackbar, closeSnackbar } = useContext(SnackbarContext);
  const [instants, setInstants] = useInstantsState([]);

  const query = search.toLowerCase();
  const filtered = query
    ? instants.filter(({ name }) => name.toLowerCase().includes(query))
    : instants;

  useEffect(() => {
    onSummary(
      search
        ? t("favorites.filteredOfTotal", { filtered: filtered.length, total: instants.length })
        : t("favorites.savedCount", { count: instants.length })
    );
  }, [search, filtered.length, instants.length, onSummary, t]);

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

  let content;

  if (instants.length === 0) {
    content = (
      <EmptyState
        title={t("favorites.emptyTitle")}
        body={t("favorites.emptyBody")}
        action={<Button onClick={() => onAddOpenChange(true)}>{t("favorites.addFirst")}</Button>}
      />
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
    </>
  );
}
