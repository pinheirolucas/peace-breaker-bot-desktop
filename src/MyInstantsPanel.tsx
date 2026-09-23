import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./components/Button";
import { CardSkeleton } from "./components/CardSkeleton";
import { EmptyState } from "./components/EmptyState";
import InstantCard, { cardState } from "./components/InstantCard";
import type { Playback } from "./components/InstantCard";
import { OfflineBanner } from "./components/OfflineBanner";
import { useMenuCommands } from "./hooks/useMenuBridge";
import { DEFAULT_PROVIDER_NAME } from "./hooks/useProvider";
import { StarIcon } from "./icons";
import { apiErrorMessage } from "./i18n/apiError";
import type { Region } from "./regions";
import SnackbarContext from "./SnackbarContext";
import { getContent, getInstants } from "./service";
import type { BotStatus } from "./service";
import { useInstantsState } from "./storage";
import type { Instant } from "./storage";
import useAudioPlayer from "./useAudioPlayer";
import useDiscordPlayer from "./useDiscordPlayer";

interface Listing {
  instants?: Instant[];
  pages?: number;
}

/** The provider this panel is browsing, as App.tsx resolves it. Optional:
 *  before the registry answers (or on a backend without one), the panel
 *  sends the exact request it always has and names MyInstants in its
 *  copy, since that is what an unresolved provider has always meant here. */
export interface ActiveProvider {
  key: string;
  name: string;
}

interface Request {
  page: number;
  search: string;
  region: Region;
  provider?: string;
}

const SKELETONS = 8;

export interface MyInstantsPanelProps {
  search: string;
  region: Region;
  provider?: ActiveProvider;
  healthy: boolean;
  /** null means unknown — see useBotStatus. Threaded straight to each
   *  card, which is the only thing that gates on it. */
  botStatus: BotStatus | null;
  serverAddress: string | null;
  onSwitchServer: () => void;
  onSummary: (summary: string) => void;
  onClearSearch: () => void;
  /** Which path is playing, for the menu bar's Parar reprodução. */
  onPlaybackChange?: (playback: "local" | "discord" | null) => void;
}

export default function MyInstantsPanel({
  search,
  region,
  provider,
  healthy,
  botStatus,
  serverAddress,
  onSwitchServer,
  onSummary,
  onClearSearch,
  onPlaybackChange
}: MyInstantsPanelProps) {
  const { t } = useTranslation();
  const [audioUrl, isAudioPlaying, playAudio, stopAudio] = useAudioPlayer();
  const [discordUrl, isDiscordPlaying, playDiscord, stopDiscord] = useDiscordPlayer();
  const [favorites, setFavorites] = useInstantsState([]);
  const { openSnackbar } = useContext(SnackbarContext);

  // Held in a ref so the listing effect does not refire whenever the
  // provider hands down a new function identity.
  const snackbar = useRef(openSnackbar);
  snackbar.current = openSnackbar;

  const providerKey = provider?.key;
  const providerName = provider?.name ?? DEFAULT_PROVIDER_NAME;

  const [request, setRequest] = useState<Request>({ page: 1, search, region, provider: providerKey });
  const [instants, setInstants] = useState<Instant[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // A new search, region or provider starts over from page 1. Returning the
  // same object when none has changed keeps the first mount from fetching
  // twice.
  useEffect(() => {
    setRequest((current) =>
      current.search === search && current.region === region && current.provider === providerKey
        ? current
        : { page: 1, search, region, provider: providerKey }
    );
  }, [search, region, providerKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Omitted rather than sent as an explicit undefined: before the
    // registry answers, this is the exact request the panel always sent.
    const call = request.provider
      ? getInstants(request.page, request.search, request.region, request.provider)
      : getInstants(request.page, request.search, request.region);

    call
      .then((data: Listing | undefined) => {
        if (cancelled) return;
        // The backend answers most errors as HTTP 200 with no data; never
        // dereference whatever arrives.
        const listing = data || {};
        const incoming = listing.instants || [];

        setInstants((current) => {
          const combined = request.page === 1 ? incoming : [...current, ...incoming];
          const seen = new Set<string>();
          return combined.filter((instant) => {
            if (seen.has(instant.url)) return false;
            seen.add(instant.url);
            return true;
          });
        });
        setTotalPages(listing.pages || 1);
        setFailed(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFailed(true);
        snackbar.current({ message: apiErrorMessage(t, err) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [request, reloadKey]);

  const firstLoad = loading && instants.length === 0;

  useEffect(() => {
    onSummary(
      firstLoad ? t("myinstants.loadingSummary") : t("myinstants.resultsSummary", { count: instants.length })
    );
  }, [firstLoad, instants.length, onSummary, t]);

  const urls = favorites.map((instant) => instant.url);

  function toggleFavorite(instant: Instant) {
    setFavorites((current) =>
      current.some(({ url }) => url === instant.url)
        ? current.filter(({ url }) => url !== instant.url)
        : [...current, instant]
    );
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
      // Unlike Favoritos there is nothing to remove here, so no action.
      openSnackbar({ message: t("common.instantGone") });
      return;
    }

    playAudio(instant.url, info.content);
  }

  async function handlePlayOnDiscord(instant: Instant) {
    const error = await playDiscord(instant.url);
    if (error) {
      openSnackbar({ message: apiErrorMessage(t, error) });
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

  function playbackOf(instant: Instant): Playback {
    if (instant.url === audioUrl) return "local";
    if (instant.url === discordUrl) return "discord";
    return "idle";
  }

  const anyPlaying = isAudioPlaying || isDiscordPlaying;
  const reload = () => setReloadKey((key) => key + 1);

  const playbackNow = isDiscordPlaying ? "discord" : isAudioPlaying ? "local" : null;

  useEffect(() => {
    onPlaybackChange?.(playbackNow);
  }, [playbackNow, onPlaybackChange]);

  // This panel unmounts with its tab; whatever it was playing goes with it.
  useEffect(() => () => onPlaybackChange?.(null), [onPlaybackChange]);

  // Same handlers as the buttons, re-checked against cardState at run time.
  useMenuCommands((command) => {
    if (command.type === "reload") {
      reload();
      return;
    }

    if (command.type === "stop") {
      if (anyPlaying) void handleStop();
      return;
    }

    if (command.type !== "card" || command.surface !== "explore") return;

    const instant = instants.find(({ url }) => url === command.url);
    if (!instant) return;

    const playback = playbackOf(instant);
    const state = cardState(playback, anyPlaying && playback === "idle", botStatus);

    if (command.action === "play" && !state.playDisabled) void handlePlay(instant);
    else if (command.action === "discord" && !state.discordDisabled) void handlePlayOnDiscord(instant);
    else if (command.action === "stop") void handleStop();
    else if (command.action === "toggle-favorite" && !state.trailDisabled) toggleFavorite(instant);
  });

  let content;

  if (firstLoad) {
    // The listing scrapes the provider's site server-side and is slow. The
    // skeleton has the card's exact footprint so nothing jumps.
    content = (
      <div className="grid" aria-busy="true">
        {Array.from({ length: SKELETONS }, (_, i) => (
          <CardSkeleton key={i} index={i} />
        ))}
      </div>
    );
  } else if (instants.length === 0) {
    if (failed) {
      content = (
        <EmptyState
          title={t("myinstants.loadFailedTitle")}
          body={t("myinstants.loadFailedBody", { provider: providerName })}
          action={
            <Button variant="secondary" onClick={reload}>
              {t("common.retry")}
            </Button>
          }
        />
      );
    } else if (request.search) {
      content = (
        <EmptyState
          title={t("common.nothingHere")}
          body={t("myinstants.noSearchResultsBody", { search: request.search, provider: providerName })}
          action={
            <Button variant="secondary" onClick={onClearSearch}>
              {t("common.clearSearch")}
            </Button>
          }
        />
      );
    } else {
      content = (
        <EmptyState
          title={t("myinstants.emptyCatalogTitle")}
          body={t("myinstants.emptyCatalogBody", { provider: providerName })}
          action={
            <Button variant="secondary" onClick={reload}>
              {t("common.retry")}
            </Button>
          }
        />
      );
    }
  } else {
    content = (
      <div className="grid" data-offline={!healthy}>
        {instants.map((instant) => {
          const playback = playbackOf(instant);
          const isFavorite = urls.includes(instant.url);
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
              menu={{
                surface: "explore",
                index: instants.indexOf(instant),
                total: instants.length,
                favorite: isFavorite,
                providerName
              }}
              trail={{
                label: t("myinstants.favorite"),
                icon: <StarIcon filled={isFavorite} />,
                pressed: isFavorite,
                onClick: () => toggleFavorite(instant)
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
      {instants.length > 0 && request.page < totalPages && (
        <div className="loadmore">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => setRequest((current) => ({ ...current, page: current.page + 1 }))}
          >
            {loading ? t("myinstants.loadingMore") : t("myinstants.loadMore")}
          </Button>
        </div>
      )}
    </>
  );
}
