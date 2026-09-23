import { useTranslation } from "react-i18next";
import { effectiveSettings } from "../../electron/presence";
import type { PresenceSettings } from "../../electron/presence";
import { Button } from "../components/Button";
import { SegmentedChoice } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { useDesktop, usePlatform } from "../hooks/usePlatform";
import type { DesktopId } from "../hooks/usePlatform";
import { usePresenceSettings } from "../hooks/usePresence";
import { AppMarkIcon } from "../icons";
import type { PlatformId } from "../themes";
import { Group, GroupLabel, PageTitle, PrefRow } from "./Pref";

export interface PresencePaneProps {
  os: PlatformId;
  desktop: DesktopId | null;
  /** False without the Electron bridge (a browser tab): there is no tray to set. */
  available: boolean;
  settings: PresenceSettings;
  onChange: (settings: PresenceSettings) => void;
  /** Jumps to Atalhos, where quick access's global shortcut lives. */
  onOpenKeys: () => void;
}

/** Barra de menus on macOS, Bandeja everywhere else: the tray icon, quick access, and how they behave. */
export function PresencePane({ os, desktop, available, settings, onChange, onOpenKeys }: PresencePaneProps) {
  const { t } = useTranslation();
  const mac = os === "mac";
  const effective = effectiveSettings(settings);
  const trayOn = effective.tray;
  const quickAccessOn = effective.quickAccess;
  const patch = (next: Partial<PresenceSettings>) => onChange({ ...settings, ...next });
  const kind = mac ? "menuBar" : "tray";

  return (
    <>
      <PageTitle title={t(`settings.sections.${kind}`)} lede={t("settings.presence.lede")} />

      <div className="mbar" aria-hidden="true">
        <span className="ph" />
        <span className="ph" />
        <span className="tray">
          {mac && effective.title && <span>{t("presence.someSound")}</span>}
          <span style={{ opacity: trayOn ? 1 : 0.3, display: "inline-flex" }}>
            <AppMarkIcon size={16} />
          </span>
        </span>
      </div>

      <GroupLabel>{t("settings.presence.icon")}</GroupLabel>
      <Group>
        <PrefRow
          title={t(`settings.presence.${kind}Title`)}
          hint={
            !available
              ? t("settings.presence.unavailable")
              : os === "win" && trayOn
                ? t("settings.presence.pinHint")
                : t("settings.presence.trayHint")
          }
        >
          <Switch
            label=""
            ariaLabel={t(`settings.presence.${kind}Title`)}
            checked={trayOn}
            disabled={!available}
            onCheckedChange={(tray) => patch({ tray })}
          />
        </PrefRow>
        {mac ? (
          <PrefRow
            dim={!trayOn}
            title={t("settings.presence.nameBeside")}
            hint={trayOn ? t("settings.presence.nameBesideHint") : t("settings.presence.needsTray")}
          >
            <Switch
              label=""
              ariaLabel={t("settings.presence.nameBeside")}
              checked={effective.title}
              disabled={!trayOn}
              onCheckedChange={(title) => patch({ title })}
            />
          </PrefRow>
        ) : (
          <PrefRow title={t("settings.presence.background")} hint={t("settings.presence.backgroundHint")}>
            <Switch
              label=""
              ariaLabel={t("settings.presence.background")}
              checked={settings.background}
              disabled={!available}
              onCheckedChange={(background) => patch({ background })}
            />
          </PrefRow>
        )}
      </Group>
      {os === "linux" && desktop === "gnome" && <p className="slede" style={{ marginTop: 8 }}>{t("settings.presence.noTray")}</p>}

      <GroupLabel>{t("settings.presence.quickAccess")}</GroupLabel>
      <Group>
        <PrefRow
          dim={!trayOn}
          title={t("settings.presence.quickAccessTitle")}
          hint={trayOn ? t("settings.presence.quickAccessHint") : t(`settings.presence.needsIcon.${kind}`)}
        >
          <Switch
            label=""
            ariaLabel={t("settings.presence.quickAccessTitle")}
            checked={quickAccessOn}
            disabled={!trayOn}
            onCheckedChange={(quickAccess) => patch({ quickAccess })}
          />
        </PrefRow>
        <PrefRow sub stack dim={!quickAccessOn} title={t("settings.presence.style")} hint={t("settings.presence.styleHint")}>
          <SegmentedChoice
            aria-label={t("settings.presence.styleLabel")}
            value={settings.quickAccessStyle}
            onChange={(quickAccessStyle) => patch({ quickAccessStyle })}
            options={[
              { value: "favorites", label: t("quickAccess.styleFavorites") },
              { value: "connection", label: t("quickAccess.styleConnection") }
            ]}
          />
        </PrefRow>
        <PrefRow
          sub
          stack
          dim={!quickAccessOn || settings.quickAccessStyle !== "favorites"}
          title={t("settings.presence.click")}
          hint={t("settings.presence.clickHint")}
        >
          <SegmentedChoice
            aria-label={t("settings.presence.click")}
            value={settings.quickAccessClick}
            onChange={(quickAccessClick) => patch({ quickAccessClick })}
            options={[
              { value: "local", label: t("settings.presence.clickLocal") },
              { value: "discord", label: t("settings.presence.clickDiscord") }
            ]}
          />
        </PrefRow>
      </Group>

      <p className="slede" style={{ marginTop: 14 }}>
        {t("settings.presence.shortcutElsewhere")}{" "}
        <Button variant="ghost" style={{ height: "auto", padding: 0 }} onClick={onOpenKeys}>
          {t("settings.sections.keys")}
        </Button>
        .
      </p>
    </>
  );
}

export interface PresenceSectionProps {
  onOpenKeys: () => void;
}

/** Writes the stored settings; the main window is the one that reports them to the main process. */
export default function PresenceSection({ onOpenKeys }: PresenceSectionProps) {
  const presence = usePresenceSettings();

  return (
    <PresencePane
      os={usePlatform()}
      desktop={useDesktop()}
      available={presence.available}
      settings={presence.settings}
      onChange={presence.setSettings}
      onOpenKeys={onOpenKeys}
    />
  );
}
