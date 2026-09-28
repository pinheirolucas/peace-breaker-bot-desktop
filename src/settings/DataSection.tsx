import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { useServers } from "../hooks/useServers";
import { describeSync, emptySync } from "../lib/favoritesSync";
import type { SyncRow } from "../lib/favoritesSync";
import { formatApiUrl } from "../ServerMenu";
import { useFavoritesSyncState, useInstantsState } from "../storage";
import { Group, GroupLabel, PageTitle, PrefRow } from "./Pref";

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60]
];

/** Seconds since `iso`, never negative: the bot's clock may run ahead of this one. Null when unreadable. */
export function secondsSince(iso: string, now = Date.now()): number | null {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  return Number.isNaN(seconds) ? null : Math.max(0, seconds);
}

/** "2 minutes ago", in the app's language, for a minute or more. */
export function timeAgo(seconds: number, language: string): string {
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const [unit, size] = units.find(([, size]) => seconds >= size) ?? ["minute", 60];
  return format.format(-Math.floor(seconds / size), unit);
}

function syncText(row: SyncRow, t: TFunction, language: string): { tone: string; title: string; body: string } {
  switch (row.state) {
    case "synced": {
      const server = formatApiUrl(row.apiUrl);
      const seconds = row.updatedAt ? secondsSince(row.updatedAt) : null;
      return {
        tone: "ok",
        title: t("settings.data.sync.synced"),
        body:
          seconds === null
            ? t("settings.data.sync.syncedBody", { owner: row.owner, server })
            : seconds < 60
              ? t("settings.data.sync.syncedJustNow", { owner: row.owner, server })
              : t("settings.data.sync.syncedWhen", { owner: row.owner, server, when: timeAgo(seconds, language) })
      };
    }
    case "waiting":
      return {
        tone: "wait",
        title: t("settings.data.sync.waiting", { count: row.count }),
        body: t(row.offline ? "settings.data.sync.waitingOffline" : "settings.data.sync.waitingSending", {
          server: formatApiUrl(row.apiUrl)
        })
      };
    case "unsupported":
      return {
        tone: "off",
        title: t("settings.data.sync.unsupported"),
        body: t("settings.data.sync.unsupportedBody", { server: formatApiUrl(row.apiUrl) })
      };
    case "stopped":
      return {
        tone: "stop",
        title: t("settings.data.sync.stopped"),
        body: row.label ? t(`api.${row.label}`, { defaultValue: row.message }) : row.message
      };
  }
}

/** Where the main window's sync with the active bot stands. */
export function SyncStatusRow({ row }: { row: SyncRow }) {
  const { t, i18n } = useTranslation();
  const { tone, title, body } = syncText(row, t, i18n.language);

  return (
    <div className="stat" role="status">
      <i className="dot" data-tone={tone} aria-hidden="true" />
      <div>
        <b>{title}</b>
        <span>{body}</span>
      </div>
    </div>
  );
}

/** Reads what the main window stored; Configurações never syncs itself. */
export function useSyncRow(): SyncRow | null {
  const [sync] = useFavoritesSyncState(emptySync);
  const [instants] = useInstantsState([]);
  const { activeUrl } = useServers();
  return describeSync(sync, instants, activeUrl);
}

export interface DataPaneProps {
  /** Null hides the row: no server, or it hasn't answered yet. */
  sync?: SyncRow | null;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  /** Starts on the question, for a story or a test that is about it. */
  defaultConfirming?: boolean;
}

export function DataPane({ sync = null, onExport, onImport, onReset, defaultConfirming = false }: DataPaneProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(defaultConfirming);

  return (
    <>
      <PageTitle title={t("settings.sections.data")} lede={t("settings.data.lede")} />

      <GroupLabel>{t("settings.data.favorites")}</GroupLabel>
      {sync && <SyncStatusRow row={sync} />}
      <Group>
        <PrefRow title={t("app.export")} hint={t("settings.data.exportHint")}>
          <Button variant="secondary" onClick={onExport}>
            {t("settings.data.exportAction")}
          </Button>
        </PrefRow>
        <PrefRow title={t("app.import")} hint={t("settings.data.importHint")}>
          <Button variant="secondary" onClick={onImport}>
            {t("settings.data.importAction")}
          </Button>
        </PrefRow>
      </Group>

      <GroupLabel>{t("settings.data.restore")}</GroupLabel>
      <Group>
        {confirming ? (
          <div className="prefrow" role="alertdialog" aria-label={t("settings.data.confirmLabel")}>
            <div className="preftx">
              <b>{t("settings.data.confirmTitle")}</b>
              <span>{t("settings.data.confirmBody")}</span>
            </div>
            <div className="sdf">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  onReset();
                }}
              >
                {t("settings.data.confirmAction")}
              </Button>
            </div>
          </div>
        ) : (
          <PrefRow title={t("settings.data.resetTitle")} hint={t("settings.data.resetHint")}>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              {t("settings.data.resetAction")}
            </Button>
          </PrefRow>
        )}
      </Group>
    </>
  );
}

export default function DataSection(props: Omit<DataPaneProps, "sync">) {
  return <DataPane sync={useSyncRow()} {...props} />;
}
