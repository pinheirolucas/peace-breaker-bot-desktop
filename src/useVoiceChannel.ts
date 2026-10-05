import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { forgetsChannel, lastChannelFrom, voiceAction } from "../electron/presence";
import type { LastChannel, VoiceAction, VoiceResult } from "../electron/presence";
import { usePresenceSnapshot } from "./hooks/usePresence";
import { ApiError, isHealthy, joinVoice, leaveVoice } from "./service";
import type { BotStatus } from "./service";
import type { SnackbarOptions } from "./SnackbarContext";
import { useLastVoiceChannelState } from "./storage";

export interface VoiceChannel {
  /** The one channel the app remembers, or null. */
  lastChannel: LastChannel | null;
  /** What the row next to the bot's channel offers right now. */
  action: VoiceAction;
  leave: () => Promise<VoiceResult>;
  /** Joins `lastChannel`; answers a failure without asking when there is none. */
  rejoin: () => Promise<VoiceResult>;
}

export interface VoiceChannelOptions {
  /** The window that stores the memory: it hands it to main at launch and saves what main learns. */
  owner?: boolean;
  /** A plain browser tab has no main to broadcast: the status an answer carries is applied here. */
  onStatus?: (status: BotStatus) => void;
}

function remembered(status: BotStatus | null): LastChannel | null {
  if (!status?.connected || !status.channelId) return null;
  return lastChannelFrom({ channelId: status.channelId, guildName: status.guildName, channelName: status.channelName });
}

// A request with no answer at all has just marked the server unhealthy, which is how it tells from an unlabelled error.
function failure(err: unknown): VoiceResult {
  if (!isHealthy()) return { ok: false, offline: true };
  return { ok: false, offline: false, label: err instanceof ApiError ? err.label : null };
}

/**
 * Leave and rejoin for a window. Under Electron main makes both calls and
 * owns the memory, which reaches every window in the presence snapshot; in
 * a plain browser tab this does both itself, over storage.
 */
export default function useVoiceChannel(
  apiUrl: string | null,
  botStatus: BotStatus | null,
  { owner = false, onStatus }: VoiceChannelOptions = {}
): VoiceChannel {
  const bridge = typeof window.instantsPresence?.leave === "function" ? window.instantsPresence : null;
  const snapshot = usePresenceSnapshot();
  const [stored, setStored] = useLastVoiceChannelState(null);
  const storedChannel = lastChannelFrom(stored);

  // Under Electron: the stored channel goes to main once, and what main learns comes back to storage.
  useEffect(() => {
    if (owner && bridge && storedChannel) bridge.seedLastChannel(storedChannel);
    // Once, at launch: main keeps it from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromMain = snapshot?.lastChannel ?? null;
  const fromMainSignature = JSON.stringify(fromMain);
  const hadFromMain = useRef(false);

  useEffect(() => {
    if (!owner || !bridge || !snapshot) return;

    if (fromMain) {
      hadFromMain.current = true;
      if (JSON.stringify(storedChannel) !== fromMainSignature) setStored(fromMain);
    } else if (hadFromMain.current) {
      // Main had one and let it go: the channel is gone. A null before any is just main not seeded yet.
      hadFromMain.current = false;
      setStored(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, bridge, fromMainSignature]);

  // In a browser tab: every status that names a channel overwrites the memory.
  const seen = bridge ? null : remembered(botStatus);
  const seenSignature = JSON.stringify(seen);

  useEffect(() => {
    if (seen && JSON.stringify(storedChannel) !== seenSignature) setStored(seen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenSignature]);

  const lastChannel = bridge ? fromMain : storedChannel;

  async function leave(): Promise<VoiceResult> {
    if (bridge) return bridge.leave();

    try {
      const status = await leaveVoice();
      onStatus?.(status);
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }

  async function rejoin(): Promise<VoiceResult> {
    if (bridge) return bridge.rejoin();
    if (!lastChannel) return { ok: false, offline: false, label: null };

    try {
      const status = await joinVoice(lastChannel.channelId);
      onStatus?.(status);
      return { ok: true };
    } catch (err) {
      const result = failure(err);
      if (!result.ok && !result.offline && forgetsChannel(result.label)) setStored(null);
      return result;
    }
  }

  return { lastChannel, action: voiceAction(apiUrl, botStatus, lastChannel), leave, rejoin };
}

type Show = (options: SnackbarOptions) => void;

export interface VoiceToasts {
  leave: () => void;
  rejoin: () => void;
  /** The toast for a play the bot refused because it is out of its channel, offering to call it back; null for any other error. */
  botAway: (err: unknown) => SnackbarOptions | null;
  /** The toast for a play refused before asking, because the bot is known to be out of its channel; offers to call it back when a channel is remembered. */
  awayNow: () => SnackbarOptions;
}

/** Runs leave and rejoin and says how they went. Shared by the window and quick access, so both say it the same way. */
export function useVoiceToasts(voice: VoiceChannel, show: Show, address: string | null): VoiceToasts {
  const { t } = useTranslation();
  const latest = useRef(voice);
  latest.current = voice;

  const failed = useCallback(
    (result: Exclude<VoiceResult, { ok: true }>): string =>
      result.offline
        ? address
          ? t("app.connectionError", { address })
          : t("server.none")
        : result.label
          ? t(`api.${result.label}`, { defaultValue: t("api.unknown_error") })
          : t("api.unknown_error"),
    [address, t]
  );

  const rejoin = useCallback(async () => {
    const channelName = latest.current.lastChannel?.channelName;
    const named = (key: string) => (channelName ? t(key, { channelName }) : t(`${key}Unnamed`));

    show({ message: named("voice.rejoining"), duration: 20000 });
    const result = await latest.current.rejoin();
    show({ message: result.ok ? named("voice.rejoined") : failed(result) });
  }, [failed, show, t]);

  const leave = useCallback(async () => {
    const { action, lastChannel } = latest.current;
    const channelName = action?.kind === "leave" ? action.channelName : undefined;
    const result = await latest.current.leave();

    if (!result.ok) {
      show({ message: failed(result) });
      return;
    }

    show({
      message: channelName ? t("voice.left", { channelName }) : t("voice.leftUnnamed"),
      ...(lastChannel ? { actionLabel: t("voice.undo"), onAction: () => void rejoin() } : {})
    });
  }, [failed, rejoin, show, t]);

  const awayNow = useCallback((): SnackbarOptions => {
    const { lastChannel } = latest.current;
    if (!lastChannel) return { message: t("voice.away") };

    return {
      message: t("voice.away"),
      actionLabel: lastChannel.channelName
        ? t("voice.rejoinAction", { channelName: lastChannel.channelName })
        : t("voice.rejoinActionUnnamed"),
      onAction: () => void rejoin()
    };
  }, [rejoin, t]);

  const botAway = useCallback(
    (err: unknown): SnackbarOptions | null => {
      if (!(err instanceof ApiError) || err.label !== "bot_not_connected" || !latest.current.lastChannel) return null;
      return awayNow();
    },
    [awayNow]
  );

  return useMemo(
    () => ({ leave: () => void leave(), rejoin: () => void rejoin(), botAway, awayNow }),
    [leave, rejoin, botAway, awayNow]
  );
}
