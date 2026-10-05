import { useId } from "react";
import type { ButtonHTMLAttributes, CSSProperties, KeyboardEvent, MouseEvent, ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { GripIcon, KeyboardIcon, PencilIcon, StopIcon } from "../icons";
import { useClipDrag } from "../hooks/useClipDrag";
import { otherPlayback, useMainPlayback } from "../hooks/useMainPlayback";
import type { ClipDragState } from "../hooks/useClipDrag";
import { menuBridge } from "../hooks/useMenuBridge";
import { overlayOpen } from "../lib/clipKeys";
import { slotFor } from "../lib/slot";
import { wavePath } from "../lib/wave";
import type { BotStatus } from "../service";
import type { Instant } from "../storage";
import { Key } from "./Key";
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
 * per card all carry over. Stop leaves the footer; rename joins it.
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
   *  and must never gate playing on Discord the same way a
   *  confirmed `connected: false` does. See useBotStatus. */
  botStatus: BotStatus | null;
  onPlay: (instant: Instant) => void;
  onPlayOnDiscord: (instant: Instant) => void;
  /** A press the card refused: "bot" while the bot is known to be out of its
   *  channel (the caller explains), "busy" while something else plays. */
  onRefuse?: (instant: Instant, reason: "bot" | "busy") => void;
  /** A middle click, Shift + click or Shift + Enter: the other way to play, whatever came of it. */
  onSecondary?: () => void;
  onStop: () => void;
  /** The panel's own action: remove in Favoritos, favourite in MyInstants.
   *  The quick access has none: editing is window work. */
  trail?: CardAction;
  /** Set while the panel is in Organizar. */
  organize?: OrganizeProps;
  /** Absent, the card has no right-click menu. */
  menu?: CardMenuInfo;
  /** The look the card briefly takes when its key is pressed, or a press is refused. */
  shortcut?: { flash?: "press" | "refuse" };
  /** Quick access's first search match: Enter plays it. */
  match?: boolean;
  /** Forces a drag-out state, for stories and tests; the pointer normally drives it. */
  dragState?: ClipDragState;
  /** Quick access's card: the body is the only control, so there is no
   *  footer (stop) and the card is shorter. cardState still gates the body
   *  exactly as it does in the window. */
  bare?: boolean;
}

/**
 * What every control may do, in one place. The two playback paths are
 * mutually exclusive, and the card body reaches both (a plain press the main
 * one, a middle click or Shift the other):
 *
 *   - playing here is refused while anything else plays and while this card
 *     plays on Discord, but stays live to replay a clip already playing here;
 *   - Discord mirrors it, and is additionally gated while the bot is
 *     confirmed to have no voice connection (`botStatus?.connected ===
 *     false` — never `!botStatus?.connected`, which would also gate on
 *     `null`, the "still loading / unreachable" state);
 *   - the body is disabled only when both are refused;
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
    bodyDisabled: busy && playback === "idle",
    botGated,
    stopDisabled: !live,
    trailDisabled: live
  };
}

/**
 * What a press on a card's body does, in one place so a click, Enter and
 * quick access's Enter-on-search cannot disagree. `mode` is where the press
 * plays: "local" is never gated by the bot; "discord" is refused while the
 * bot is confirmed to be out of its channel (`"bot"`, which the caller
 * explains) or while something else plays (`"busy"`). An unknown status
 * (null) never blocks.
 */
export function bodyClick(
  mode: "local" | "discord",
  playback: Playback,
  otherPlaying: boolean,
  botStatus: BotStatus | null
): "play" | "discord" | "bot" | "busy" {
  const state = cardState(playback, otherPlaying, botStatus);

  if (mode === "local") return state.playDisabled ? "busy" : "play";
  if (state.botGated) return "bot";
  return state.discordDisabled ? "busy" : "discord";
}

export default function InstantCard({
  instant,
  playback,
  otherPlaying,
  botStatus,
  onPlay,
  onPlayOnDiscord,
  onRefuse,
  onSecondary,
  onStop,
  trail,
  organize,
  menu,
  shortcut,
  match,
  dragState,
  bare
}: InstantCardProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const state = cardState(playback, otherPlaying, botStatus);
  const [main] = useMainPlayback();
  const other = otherPlayback(main);
  const tooltip = main === "discord" ? t("card.tooltipDiscord") : t("card.tooltipLocal");
  const dragging = organize?.drag === "overlay";
  const clipKey = instant.key;
  const drag = useClipDrag({ name: instant.name, url: instant.url }, !organize);
  const clipDrag = { ...drag, state: dragState ?? drag.state };
  // The keycap and the playing chip share a corner.
  const showKeycap = Boolean(clipKey) && !match && (organize ? true : !state.live);
  const showEmptyKeycap = !clipKey && Boolean(organize) && !organize?.drag;

  function press(mode: "local" | "discord") {
    const what = bodyClick(mode, playback, otherPlaying, botStatus);

    if (what === "play") onPlay(instant);
    else if (what === "discord") onPlayOnDiscord(instant);
    else onRefuse?.(instant, what);
  }

  function pressOther() {
    press(other);
    onSecondary?.();
  }

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
      main,
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
      {...clipDrag.bind}
      data-clip={clipDrag.state === "rest" ? undefined : clipDrag.state}
      ref={organize?.rootRef}
      style={organize?.style}
      className={`pad ${slotFor(instant.url)}`}
      // The handle's own name is "Mover …", which would otherwise become the
      // card's name through the heading, so the card names itself here.
      aria-labelledby={organize ? undefined : headingId}
      aria-label={organize ? instant.name : undefined}
      data-live={state.live}
      data-dim={state.dim}
      data-inert={state.bodyDisabled}
      data-organize={organize ? true : undefined}
      data-bare={bare && !organize ? true : undefined}
      data-drag={organize?.drag}
      data-flash={shortcut?.flash}
      data-match={match || undefined}
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
      {match && (
        <Key card className="pkey" aria-hidden="true">
          ↵
        </Key>
      )}
      {(showKeycap || showEmptyKeycap) && !dragging && (
        <Key card className="pkey" empty={!clipKey} pressed={shortcut?.flash === "press" && Boolean(clipKey)} aria-hidden="true">
          {clipKey ? clipKey.toUpperCase() : ""}
        </Key>
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
            title={tooltip}
            data-act="play"
            data-main={main}
            aria-keyshortcuts={
              clipKey
                ? `Enter Shift+Enter ${clipKey.toUpperCase()} Shift+${clipKey.toUpperCase()}`
                : "Enter Shift+Enter"
            }
            disabled={state.bodyDisabled}
            onClick={(event) => (event.shiftKey ? pressOther() : press(main))}
            // A middle press would start autoscroll (Windows) or paste the primary selection (Linux).
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              pressOther();
            }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key !== "Enter" || !event.shiftKey) return;
              event.preventDefault();
              pressOther();
            }}
          >
            {instant.name}
          </button>
        )}
      </h3>

      {clipDrag.state === "preparing" && (
        <span className="pprep" role="progressbar" aria-label={t("card.preparing")} />
      )}

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

      {(!bare || organize || trail) && (
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
                aria-label={t("card.stop")}
                title={t("card.stop")}
                disabled={state.stopDisabled}
                onClick={onStop}
              >
                <StopIcon />
              </button>
            </>
          )}
          {trail && (
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
          )}
        </div>
      )}
    </article>
  );
}
