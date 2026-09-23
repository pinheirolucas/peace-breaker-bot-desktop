import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { Server } from "../../electron/discovery";
import { ArrowUpRightIcon, RefreshIcon } from "../icons";
import { formatApiUrl } from "../ServerMenu";
import type { BotStatus } from "../service";
import type { Instant } from "../storage";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import InstantCard from "./InstantCard";
import type { Playback } from "./InstantCard";
import { SearchField } from "./SearchField";
import "./panel.css";

function OpenApp({ onOpenApp }: { onOpenApp: () => void }) {
  const { t } = useTranslation();

  return (
    <button type="button" className="popen" onClick={onOpenApp}>
      {t("panel.openApp")}
      <ArrowUpRightIcon />
    </button>
  );
}

export interface PanelFavoritesProps {
  /** Already filtered by the query. */
  instants: Instant[];
  /** All favourites, for the count and the placeholder. */
  total: number;
  query: string;
  onQuery: (query: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  playbackOf: (instant: Instant) => Playback;
  otherPlaying: boolean;
  botStatus: BotStatus | null;
  /** The active server is silent: a banner, and the grid steps back. Every button stays live. */
  offline: boolean;
  onRetry: () => void;
  /** The first match wears a ring and an Enter chip until the query changes. */
  matchUrl: string | null;
  /** Shown until the first drag. */
  hint: boolean;
  onPlay: (instant: Instant) => void;
  onPlayOnDiscord: (instant: Instant) => void;
  onStop: () => void;
  onOpenApp: () => void;
}

/** The Favoritos style: the window's own cards at the Tight tier, plus search and a footer. */
export function PanelFavorites({
  instants,
  total,
  query,
  onQuery,
  searchRef,
  playbackOf,
  otherPlaying,
  botStatus,
  offline,
  onRetry,
  matchUrl,
  hint,
  onPlay,
  onPlayOnDiscord,
  onStop,
  onOpenApp
}: PanelFavoritesProps) {
  const { t } = useTranslation();

  return (
    <>
      {total > 0 && (
        <div className="psearch">
          <SearchField
            ref={searchRef}
            value={query}
            aria-label={t("panel.searchLabel")}
            placeholder={t("app.searchInFavorites", { count: total })}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
      )}

      {offline && (
        <div className="banner" role="status">
          <span>
            <b>{t("presence.silent")}</b>
            <span>{t("panel.offline")}</span>
          </span>
          <button type="button" className="bb" onClick={onRetry}>
            {t("panel.retry")}
          </button>
        </div>
      )}

      <div className="scroll">
        {total === 0 ? (
          <EmptyState
            title={t("panel.emptyTitle")}
            body={t("panel.emptyBody")}
            action={
              <Button variant="secondary" onClick={onOpenApp}>
                {t("panel.openApp")}
              </Button>
            }
          />
        ) : instants.length === 0 ? (
          <EmptyState
            title={t("panel.noMatch", { query })}
            body={t("panel.noMatchBody")}
            action={
              <Button variant="secondary" onClick={() => onQuery("")}>
                {t("panel.clear")}
              </Button>
            }
          />
        ) : (
          <div className="grid" data-offline={offline}>
            {instants.map((instant) => (
              <InstantCard
                key={instant.url}
                instant={instant}
                playback={playbackOf(instant)}
                otherPlaying={otherPlaying}
                botStatus={botStatus}
                match={instant.url === matchUrl}
                onPlay={onPlay}
                onPlayOnDiscord={onPlayOnDiscord}
                onStop={onStop}
              />
            ))}
          </div>
        )}
      </div>

      {hint && total > 0 && <p className="phint">{t("panel.hint")}</p>}

      <footer className="pfooter">
        <span>{t("panel.count", { count: total })}</span>
        <OpenApp onOpenApp={onOpenApp} />
      </footer>
    </>
  );
}

export interface ServerRowProps {
  server: Server;
  active: boolean;
  /** Only the active server has a health dot: health is passive, so the others are not known. */
  healthy: boolean;
  onSelect: (server: Server) => void;
}

function describe(server: Server, t: (key: string) => string): string {
  if (!server.hostname) {
    return server.isLocal ? t("server.onlyThisComputer") : "";
  }

  return server.isLocal ? `${server.hostname} · ${t("server.thisComputer")}` : server.hostname;
}

/** One click switches, no confirm step: switching is cheap and reversible. */
export function ServerRow({ server, active, healthy, onSelect }: ServerRowProps) {
  const { t } = useTranslation();
  const address = formatApiUrl(server.apiUrl);
  const sub = describe(server, t);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className="prow"
      data-active={active}
      onClick={() => onSelect(server)}
    >
      <span className="ptxt">
        <b>{address}</b>
        {sub && <span>{sub}</span>}
      </span>
      {active && (
        <>
          <span className="ptag">{t("panel.inUse")}</span>
          <span className="dot" data-healthy={healthy} aria-hidden="true" />
        </>
      )}
    </button>
  );
}

export interface PanelConnectionProps {
  servers: Server[];
  activeUrl: string | null;
  healthy: boolean;
  searching: boolean;
  onSelect: (server: Server) => void;
  onSearch: () => void;
  onOpenApp: () => void;
  /** Hugs its content between 260 and 520px, then the list scrolls. */
  bodyRef?: RefObject<HTMLDivElement | null>;
}

/** The Conexão style: no sounds, only the server — am I connected, to what, and is there another one? */
export function PanelConnection({
  servers,
  activeUrl,
  healthy,
  searching,
  onSelect,
  onSearch,
  onOpenApp,
  bodyRef
}: PanelConnectionProps) {
  const { t } = useTranslation();
  // A server that died leaves the list while still being the one in use, so it stays as the first row.
  const activeListed = servers.some((server) => server.apiUrl === activeUrl);
  const rows: Server[] =
    activeUrl && !activeListed
      ? [
          {
            id: activeUrl,
            apiUrl: activeUrl,
            address: null,
            port: 0,
            hostname: null,
            isLocal: false
          },
          ...servers
        ]
      : servers;

  const searchButton: ReactNode = (
    <Button variant="secondary" disabled={searching} onClick={onSearch}>
      <RefreshIcon size={14} />
      {searching ? t("panel.searching") : t("panel.searchAgain")}
    </Button>
  );

  return (
    <>
      <div className="pconn" ref={bodyRef}>
        {rows.length === 0 ? (
          <EmptyState
            title={t("server.none")}
            body={t("panel.noneBody")}
            action={searchButton}
          />
        ) : (
          <>
            <div className="phead">
              <span>
                {t("panel.servers")} <b>{rows.length}</b>
              </span>
              {searchButton}
            </div>
            <div className="plist" role="radiogroup" aria-label={t("panel.servers")}>
              {rows.map((server) => (
                <ServerRow
                  key={server.id}
                  server={server}
                  active={server.apiUrl === activeUrl}
                  healthy={healthy}
                  onSelect={onSelect}
                />
              ))}
              {searching && <div className="prow prow--ghost" aria-hidden="true" />}
            </div>
          </>
        )}
      </div>

      <footer className="pfooter">
        <span>{t("panel.connectionNote")}</span>
        <OpenApp onOpenApp={onOpenApp} />
      </footer>
    </>
  );
}
