import type { ReactNode } from "react";
import { Key } from "./Key";
import { useTranslation } from "react-i18next";
import { statusLine, statusTone } from "../../electron/presence";
import type { PresenceSnapshot, StatusTone } from "../../electron/presence";
import { MoreIcon, PinIcon, StopIcon } from "../icons";
import { formatApiUrl } from "../ServerMenu";
import { IconButton } from "./Button";
import { Menu } from "./Menu";
import "./quickAccess.css";

/** Green connected, amber out of channel, red silent, grey unknown: the window's server chip, in quick access.
 *  The decision is presence.ts's, so the tray menu's dot cannot drift from this one. */
export type StripTone = StatusTone;
export const stripTone = statusTone;

export interface PresenceStripProps {
  snapshot: PresenceSnapshot;
  pinned: boolean;
  onStop: () => void;
  onPin: () => void;
  /** The ⋯ menu's items. */
  menu: ReactNode;
}

/**
 * Quick access's first row, the same in both styles: what the app is doing, and
 * Stop. Fixed at 56px, and Stop is never absent, only disabled, so nothing
 * shifts under a pointer that is mid-call. It reads main's snapshot, so a clip
 * started in the window shows as playing here and the other way round.
 */
export function PresenceStrip({ snapshot, pinned, onStop, onPin, menu }: PresenceStripProps) {
  const { t } = useTranslation();
  const playing = snapshot.playing !== null;

  return (
    <header className="pstrip" data-playing={playing}>
      <span className="sdot" data-tone={stripTone(snapshot)} aria-hidden="true" />
      <span className="ptext" role="status">
        <b>{statusLine(snapshot, t)}</b>
        {snapshot.server && <span>{formatApiUrl(snapshot.server)}</span>}
      </span>
      <button
        type="button"
        className="pstop"
        data-active={playing}
        disabled={!playing}
        aria-label={t("quickAccess.stop")}
        onClick={onStop}
      >
        <StopIcon size={13} />
        <span>{t("quickAccess.stop")}</span>
        <Key quiet onAccent={playing} dis={!playing}>{t("quickAccess.esc")}</Key>
      </button>
      <IconButton label={t("quickAccess.pin")} aria-pressed={pinned} className="ppin" onClick={onPin}>
        <PinIcon filled={pinned} />
      </IconButton>
      <Menu trigger={<IconButton label={t("quickAccess.more")}><MoreIcon /></IconButton>}>{menu}</Menu>
    </header>
  );
}
