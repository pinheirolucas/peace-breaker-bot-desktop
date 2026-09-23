import { useId } from "react";
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { GripIcon, KeyboardIcon, PencilIcon, SendIcon, StopIcon } from "../icons";
import { menuBridge } from "../hooks/useMenuBridge";
import { overlayOpen } from "../lib/clipKeys";
import { slotFor } from "../lib/slot";
import { wavePath } from "../lib/wave";
import type { BotStatus } from "../service";
import type { Instant } from "../storage";
import "./card.css";

/** What this card is doing right now. */
export type Playback = "idle" | "local" | "discord";

export interface CardAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Set for a toggle (the favourite star), so its state is announced. */
  pressed?: boolean;
}

/**
 * Organizar mode. The clip-name button stops playing and becomes the drag
 * handle, so the stretched hit, the footer's z-index and the one focus stop
 * per card all carry over. Send and stop leave the footer; rename joins it.
 */
export interface OrganizeProps {
  /** 1-based, for the handle's name and the drag chip. */
  position: number;
  total: number;
  /** Gets the card's rendered width, so the rename dialog can preview the
   *  card at the size it really is in the grid. */
  onRename: (cardWidth: number) => void;
  /** Opens the key dialog; absent leaves the button out. */
  onSetKey?: () => void;
  /** "ghost" is the slot a dragged card left; "overlay" is the copy that
   *  follows the pointer. Neither is interactive. */
  drag?: "ghost" | "overlay";
  /** dnd-kit's activator bits, spread onto the handle. Absent on the overlay. */
  handleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  handleRef?: Ref<HTMLButtonElement>;
  rootRef?: Ref<HTMLElement>;
  style?: CSSProperties;
}

/** What the native right-click menu needs beyond the card's own state. */
export interface CardMenuInfo {
  surface: "favorites" | "explore";
  /** 0-based, in the whole list. */
  index: number;
  total: number;
  /** Explorar: already a favourite. */
  favorite: boolean;
  providerName: string;
}

export interface InstantCardProps {
  instant: Instant;
  playback: Playback;
  /** Some other card in the same panel is playing. */
  otherPlaying: boolean;
  /** null means unknown — still loading, or an old/unreachable backend —
   *  and must never gate the send-to-Discord button the same way a
   *  confirmed `connected: false` does. See useBotStatus. */
  botStatus: BotStatus | null;
  onPlay: (instant: Instant) => void;
  onPlayOnDiscord: (instant: Instant) => void;
  onStop: () => void;
  /** The panel's own action: remove in Favoritos, favourite in MyInstants. */
  trail: CardAction;
  /** Set while the panel is in Organizar. */
  organize?: OrganizeProps;
  /** Absent, the card has no right-click menu. */
  menu?: CardMenuInfo;
  /** Favoritos only: the look the card briefly takes when its key is pressed or refused. */
  shortcut?: { flash?: "press" | "refuse" };
}

/**
 * The whole footer state matrix, in one place. Ported from the design
 * canvas's prototype logic. The two playback paths are mutually exclusive:
 *
 *   - the body plays locally. It is inert while anything else plays and
 *     while this card plays on Discord, but stays live to replay a clip
 *     already playing locally here;
 *   - send-to-Discord mirrors it, and is additionally gated while the bot
 *     is confirmed to have no voice connection (`botStatus?.connected ===
 *     false` — never `!botStatus?.connected`, which would also gate on
 *     `null`, the "still loading / unreachable" state that must fall
 *     through to today's rule instead);
 *   - stop exists only on the card that is playing;
 *   - a playing card locks its own trailing action.
 */
export function cardState(playback: Playback, otherPlaying: boolean, botStatus: BotStatus | null) {
  const live = playback !== "idle";
  const busy = live || otherPlaying;
  const botGated = botStatus?.connected === false && playback !== "discord";

  return {
    live,
    dim: otherPlaying && !live,
    playDisabled: busy && playback !== "local",
    discordDisabled: (busy && playback !== "discord") || botGated,
    botGated,
    stopDisabled: !live,
    trailDisabled: live
  };
}

export default function InstantCard({
  instant,
  playback,
  otherPlaying,
  botStatus,
  onPlay,
  onPlayOnDiscord,
  onStop,
  trail,
  organize,
  menu,
  shortcut
}: InstantCardProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const state = cardState(playback, otherPlaying, botStatus);
  const discordLabel = state.botGated ? t("card.discordUnavailable") : t("card.playOnDiscord");
  const dragging = organize?.drag === "overlay";
  const clipKey = instant.key;
  // The keycap and the playing chip share a corner.
  const showKeycap = Boolean(clipKey) && (organize ? true : !state.live);
  const showEmptyKeycap = !clipKey && Boolean(organize) && !organize?.drag;

  // The menu is built by the main process, which cannot tell which card was
  // hit: this sends cardState's own answers, so it never offers what a
  // button here would refuse.
  function handleContextMenu(event: MouseEvent<HTMLElement>) {
    const bridge = menuBridge();
    if (!bridge || !menu || dragging) return;

    event.preventDefault();
    if (overlayOpen()) return;

    bridge.cardContext({
      surface: menu.surface,
      url: instant.url,
      name: instant.name,
      playback,
      state: {
        playDisabled: state.playDisabled,
        discordDisabled: state.discordDisabled,
        botGated: state.botGated,
        stopDisabled: state.stopDisabled,
        trailDisabled: state.trailDisabled
      },
      key: clipKey ?? null,
      organizing: Boolean(organize),
      favorite: menu.favorite,
      providerName: menu.providerName,
      index: menu.index,
      total: menu.total,
      width: event.currentTarget.offsetWidth
    });
  }

  return (
    <article
      onContextMenu={handleContextMenu}
      ref={organize?.rootRef}
      style={organize?.style}
      className={`pad ${slotFor(instant.url)}`}
      // The handle's own name is "Mover …", which would otherwise become the
      // card's name through the heading, so the card names itself here.
      aria-labelledby={organize ? undefined : headingId}
      aria-label={organize ? instant.name : undefined}
      data-live={state.live}
      data-dim={state.dim}
      data-inert={state.playDisabled}
      data-organize={organize ? true : undefined}
      data-drag={organize?.drag}
      data-flash={shortcut?.flash}
      aria-hidden={dragging || undefined}
    >
      {state.live && !organize && (
        <span className="chip">
          {playback === "discord" ? t("card.playingDiscord") : t("card.playingLocal")}
        </span>
      )}
      {dragging && organize && (
        <span className="chip">
          {t("card.position", {
            pos: organize.position,
            total: organize.total
          })}
        </span>
      )}
      {(showKeycap || showEmptyKeycap) && !dragging && (
        <span className="kc" data-empty={!clipKey || undefined} aria-hidden="true">
          {clipKey ? clipKey.toUpperCase() : ""}
        </span>
      )}
      {organize && !organize.drag && (
        <span className="pgrip" aria-hidden="true">
          <GripIcon />
        </span>
      )}

      <h3 className="pname" id={headingId}>
        {organize ? (
          <button
            type="button"
            className="phit"
            ref={organize.handleRef}
            aria-label={t("card.moveHandle", {
              name: instant.name,
              pos: organize.position,
              total: organize.total
            })}
            {...organize.handleProps}
          >
            {instant.name}
          </button>
        ) : (
          <button
            type="button"
            className="phit"
            title={t("card.play")}
            data-act="play"
            aria-keyshortcuts={
              clipKey ? `${clipKey.toUpperCase()} Shift+${clipKey.toUpperCase()}` : undefined
            }
            disabled={state.playDisabled}
            onClick={() => onPlay(instant)}
          >
            {instant.name}
          </button>
        )}
      </h3>

      <svg
        className="pwave"
        viewBox="0 0 250 26"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.4}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d={wavePath(instant.name)} />
      </svg>

      <div className="pfoot">
        {organize ? (
          <>
            <button
              type="button"
              className="pb"
              aria-label={t("card.rename")}
              title={t("card.rename")}
              onClick={(event) =>
                organize.onRename(event.currentTarget.closest("article")?.offsetWidth ?? 0)
              }
            >
              <PencilIcon />
            </button>
            {organize.onSetKey && (
              <button
                type="button"
                className="pb"
                aria-label={t("shortcuts.setFor", { name: instant.name })}
                title={t("shortcuts.set")}
                onClick={organize.onSetKey}
              >
                <KeyboardIcon />
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="pb"
              aria-label={discordLabel}
              title={discordLabel}
              data-act="discord"
              disabled={state.discordDisabled}
              onClick={() => onPlayOnDiscord(instant)}
            >
              <SendIcon />
            </button>
            <button
              type="button"
              className="pb"
              aria-label={t("card.stop")}
              title={t("card.stop")}
              disabled={state.stopDisabled}
              onClick={onStop}
            >
              <StopIcon />
            </button>
          </>
        )}
        <button
          type="button"
          className="pb trail"
          aria-label={trail.label}
          title={trail.label}
          aria-pressed={trail.pressed}
          disabled={state.trailDisabled}
          onClick={trail.onClick}
        >
          {trail.icon}
        </button>
      </div>
    </article>
  );
}
