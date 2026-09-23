import { useTranslation } from "react-i18next";
import type { Server } from "../electron/discovery";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "./components/Menu";
import { menuBridge } from "./hooks/useMenuBridge";
import { ServerChip } from "./components/ServerChip";
import { CheckIcon, CloseIcon, PlusIcon, RefreshIcon } from "./icons";
import type { BotStatus } from "./service";

export function formatApiUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "").replace(/^https?:\/\//, "");
  }
}

/** The line under an address: this computer, or the hostname it advertises. */
export function describeServer(server: Server, t: (key: string) => string): string {
  if (!server.hostname) {
    return server.isLocal ? t("server.onlyThisComputer") : "";
  }

  return server.isLocal ? `${server.hostname} · ${t("server.thisComputer")}` : server.hostname;
}

export interface ServerMenuProps {
  servers: Server[];
  currentApiUrl: string | null;
  healthy: boolean;
  /** null means unknown — see useBotStatus. Threaded through to the chip
   *  and this menu's own header second line. */
  botStatus: BotStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (server: Server) => void;
  onRefresh: () => void;
  onAddServer: () => void;
  onRemoveServer: (server: Server) => void;
  /** The way into Configurações › Servidor, for what a pick cannot do. */
  onOpenSettings?: () => void;
}

/** The header's second line: which of the bot's channel, "not in a
 *  channel", or nothing at all to show under the address. Only a
 *  confirmed status earns a line — unknown, or connected with unresolved
 *  names (a cache miss right after a fresh !join), shows nothing rather
 *  than a stale or empty one. */
export function botLine(
  healthy: boolean,
  botStatus: BotStatus | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): string | null {
  if (!healthy || !botStatus) {
    return null;
  }

  if (botStatus.connected === false) {
    return t("server.notInVoice");
  }

  if (botStatus.connected && botStatus.guildName && botStatus.channelName) {
    return t("server.inVoice", { guildName: botStatus.guildName, channelName: botStatus.channelName });
  }

  return null;
}

/**
 * The picker. The current address sits in the menu's own header rather than
 * as a list row, because the current target need not be in the list at all:
 * there is no default server at all until one is picked or discovered, and
 * a server that dies leaves the list while still being the one in use. One
 * click switches — no confirm step, since switching is cheap and reversible.
 */
export default function ServerMenu({
  servers,
  currentApiUrl,
  healthy,
  botStatus,
  open,
  onOpenChange,
  onSelect,
  onRefresh,
  onAddServer,
  onRemoveServer,
  onOpenSettings
}: ServerMenuProps) {
  const { t } = useTranslation();
  const current = currentApiUrl ? formatApiUrl(currentApiUrl) : null;
  const sub = botLine(healthy, botStatus, t);

  const local = servers.filter((server) => !server.manual);
  const remote = servers.filter((server) => server.manual);

  function row(server: Server) {
    return (
      <MenuItem
        key={server.id}
        tick={server.apiUrl === currentApiUrl ? <CheckIcon /> : null}
        primary={formatApiUrl(server.apiUrl)}
        secondary={describeServer(server, t) || undefined}
        onSelect={() => onSelect(server)}
        closeOnSelect={false}
        trail={server.manual ? <CloseIcon size={12} /> : undefined}
        trailLabel={server.manual ? t("server.remove", { address: formatApiUrl(server.apiUrl) }) : undefined}
        onTrailSelect={server.manual ? () => onRemoveServer(server) : undefined}
        onContextMenu={(event) => {
          // The row menu opens over the picker, so unlike other right-clicks it is not held back by the open menu.
          const bridge = menuBridge();
          if (!bridge) return;
          event.preventDefault();
          bridge.serverRowContext(server.id);
        }}
      />
    );
  }

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <ServerChip
          address={current}
          healthy={healthy}
          botStatus={botStatus}
          onContextMenu={(event) => {
            const bridge = menuBridge();
            if (!bridge) return;
            event.preventDefault();
            bridge.serverContext();
          }}
        />
      }
    >
      {/* With no active server there is nothing discovered either — the two
       *  never disagree in this app — so the empty list state below already
       *  says "no server" once; a header repeating it here would just be the
       *  same three words stacked twice in a row. */}
      {current && (
        <>
          <div className="mhead">
            {t("server.connectedTo")} <b>{current}</b>
            {sub && <span className="msub">{sub}</span>}
          </div>
          <MenuSeparator />
        </>
      )}

      <MenuLabel>{t("server.localNetwork")}</MenuLabel>
      {local.length === 0 && (
        <MenuItem disabled primary={t("server.none")} secondary={t("server.noneHint")} />
      )}
      {local.map(row)}

      <MenuSeparator />
      <MenuLabel>{t("server.remote")}</MenuLabel>
      {remote.length === 0 && <MenuItem disabled primary={t("server.noneManual")} />}
      {remote.map(row)}

      <MenuSeparator />
      <MenuItem tick={<PlusIcon />} primary={t("server.add")} onSelect={onAddServer} />

      <MenuSeparator />
      <MenuItem
        tick={<RefreshIcon />}
        primary={t("server.refresh")}
        onSelect={onRefresh}
        closeOnSelect={false}
      />

      {onOpenSettings && (
        <>
          <MenuSeparator />
          <MenuItem primary={t("server.settings")} onSelect={onOpenSettings} />
        </>
      )}
    </Menu>
  );
}
