import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import type { BotStatus } from "../service";
import "./controls.css";

export interface ServerChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  address: string | null;
  healthy: boolean;
  /** null means unknown — still loading, or an old/unreachable backend —
   *  and must render exactly like today (green dot, no aria-label
   *  override), the same way it must not gate the card's send-to-Discord
   *  button. Only a confirmed `connected: false` earns the amber warning.
   *  See useBotStatus. */
  botStatus?: BotStatus | null;
}

/**
 * The backend address, visible as text rather than hidden behind an icon
 * with a badge: which bot you are talking to is worth a glance. With no
 * active server at all — nothing picked, nothing discovered — `address` is
 * null and the chip names that state instead, which is already a complete
 * accessible name on its own.
 *
 * The dot has three states, and the visible text never grows past the
 * address (CLAUDE.md's "Connection health is passive"): red when the
 * server itself is unresponsive (unchanged), amber when it answers but the
 * bot is confirmed to have no voice connection, green otherwise — the
 * default, covering both "connected to a channel" and "unknown", since an
 * unresolved bot status must look exactly like today rather than like a
 * warning. Amber and green each also get an explicit aria-label, still
 * starting with the address (WCAG label-in-name) so voice control users
 * can still say what they see; not screen-reader-only text appended as a
 * second node, for the same reason the red state already avoids it — the
 * accessible-name algorithm drops the whitespace between nodes.
 */
export const ServerChip = forwardRef<HTMLButtonElement, ServerChipProps>(
  function ServerChip({ address, healthy, botStatus, ...rest }, ref) {
    const { t } = useTranslation();
    const label = address ?? t("server.none");

    const botAway = healthy && botStatus?.connected === false;
    const botNamed =
      healthy && botStatus?.connected === true && Boolean(botStatus.guildName) && Boolean(botStatus.channelName);

    let ariaLabel: string | undefined;
    if (address && !healthy) {
      ariaLabel = t("server.unresponsive", { address });
    } else if (address && botAway) {
      ariaLabel = t("server.chipNotInVoice", { address });
    } else if (address && botNamed) {
      ariaLabel = t("server.chipInVoice", {
        address,
        guildName: botStatus!.guildName,
        channelName: botStatus!.channelName
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        className="srv"
        title={t("server.switchTitle")}
        aria-label={ariaLabel}
        {...rest}
      >
        <span className="dot" data-healthy={healthy} data-bot-away={botAway} aria-hidden="true" />
        {label}
      </button>
    );
  }
);
