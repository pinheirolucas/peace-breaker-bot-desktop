import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { quickAccessShortcutKey } from "../../electron/quickAccess";
import type { GlobalModifier } from "../../electron/shortcuts";
import { SegmentedChoice } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { useGlobalShortcutSettings } from "../hooks/useGlobalShortcuts";
import type { GlobalShortcutSettings } from "../hooks/useGlobalShortcuts";
import { usePresenceSettings } from "../hooks/usePresence";
import { useQuickAccessShortcutSettings } from "../hooks/useQuickAccessShortcut";
import type { QuickAccessShortcutSettings } from "../hooks/useQuickAccessShortcut";
import { comboLabel, shortcutLabel, usePlatform } from "../hooks/usePlatform";
import type { PlatformId } from "../themes";
import { Group, GroupLabel, PageTitle, PrefRow } from "./Pref";

export interface KeysPaneProps {
  os: PlatformId;
  globalKeys: Pick<GlobalShortcutSettings, "available" | "enabled" | "modifier" | "modifiers" | "setEnabled" | "setModifier">;
  quickAccess: Pick<QuickAccessShortcutSettings, "available" | "enabled" | "modifier" | "modifiers" | "set">;
  /** Quick access itself is on: its shortcut has nothing to open otherwise. */
  quickAccessOn: boolean;
  /** Another app already holds the quick access combination. */
  conflict: boolean;
  onClearConflict: () => void;
}

function Kbd({ children }: { children: string }) {
  return <span className="kbd">{children}</span>;
}

export function KeysPane({ os, globalKeys, quickAccess, quickAccessOn, conflict, onClearConflict }: KeysPaneProps) {
  const { t } = useTranslation();
  const comboOptions = (suffix: string) => (modifiers: GlobalModifier[]) =>
    modifiers.map((value) => ({
      value,
      label: comboLabel(os, value, "").replace(/\+$/, "") + suffix
    }));

  const globalOn = globalKeys.available && globalKeys.enabled;
  const shortcutOn = quickAccess.enabled && quickAccessOn;
  const mod = (key: string) => shortcutLabel(os, key);

  return (
    <>
      <PageTitle title={t("settings.sections.keys")} lede={t("settings.keys.lede")} />

      <GroupLabel>{t("settings.keys.favorites")}</GroupLabel>
      <Group>
        <PrefRow
          title={t("settings.keys.globalTitle")}
          hint={globalKeys.available ? t("settings.keys.globalHint") : t("settings.keys.unavailable")}
        >
          <Switch
            label=""
            ariaLabel={t("settings.keys.globalTitle")}
            checked={globalOn}
            disabled={!globalKeys.available}
            onCheckedChange={globalKeys.setEnabled}
          />
        </PrefRow>
        {globalKeys.modifier && (
          <PrefRow sub stack dim={!globalOn} title={t("settings.keys.combo")} hint={t("settings.keys.comboGlobalHint")}>
            <SegmentedChoice
              aria-label={t("settings.keys.comboGlobalLabel")}
              value={globalKeys.modifier}
              onChange={globalKeys.setModifier}
              options={comboOptions("")(globalKeys.modifiers)}
            />
          </PrefRow>
        )}
      </Group>

      <GroupLabel>{t("settings.keys.quickAccess")}</GroupLabel>
      <Group>
        <PrefRow
          dim={!quickAccessOn}
          title={t("settings.keys.quickAccessTitle")}
          hint={
            !quickAccess.available
              ? t("settings.keys.unavailable")
              : quickAccessOn
                ? t("settings.keys.quickAccessHint")
                : t("settings.keys.needsQuickAccess")
          }
        >
          <Switch
            label=""
            ariaLabel={t("settings.keys.quickAccessTitle")}
            checked={shortcutOn}
            disabled={!quickAccess.available || !quickAccessOn}
            onCheckedChange={(enabled) => {
              onClearConflict();
              quickAccess.set({ enabled, modifier: quickAccess.modifier });
            }}
          />
        </PrefRow>
        {quickAccess.modifier && (
          <PrefRow sub stack dim={!shortcutOn} title={t("settings.keys.combo")} hint={t("settings.keys.comboQuickHint")}>
            <SegmentedChoice
              aria-label={t("settings.keys.comboQuickLabel")}
              value={quickAccess.modifier}
              onChange={(modifier) => {
                onClearConflict();
                quickAccess.set({ enabled: quickAccess.enabled, modifier });
              }}
              options={comboOptions(` ${quickAccessShortcutKey.toUpperCase()}`)(quickAccess.modifiers)}
            />
            {conflict && (
              <p className="msg" role="alert">
                {t("settings.keys.conflict")}
              </p>
            )}
          </PrefRow>
        )}
      </Group>

      <GroupLabel>{t("settings.keys.inApp")}</GroupLabel>
      <Group>
        <div className="kt">
          <div>
            <Kbd>{t("settings.keys.keyWord")}</Kbd>
          </div>
          <span>{t("settings.keys.playDiscord")}</span>
          <div>
            <Kbd>Shift</Kbd>+<Kbd>{t("settings.keys.keyWord")}</Kbd>
          </div>
          <span>{t("settings.keys.playLocal")}</span>
          <div>
            <Kbd>Esc</Kbd>
          </div>
          <span>{t("settings.keys.stop")}</span>
          <div>
            <Kbd>{mod("F")}</Kbd>
          </div>
          <span>{t("settings.keys.find")}</span>
          <div>
            <Kbd>{mod("1")}</Kbd>
            <Kbd>{mod("2")}</Kbd>
          </div>
          <span>{t("settings.keys.tabs")}</span>
          <div>
            <Kbd>{mod("N")}</Kbd>
          </div>
          <span>{t("settings.keys.add")}</span>
          <div>
            <Kbd>{mod(",")}</Kbd>
          </div>
          <span>{t("settings.keys.openSettings")}</span>
          <div>
            <Kbd>?</Kbd>
          </div>
          <span>{t("settings.keys.sheet")}</span>
        </div>
      </Group>
    </>
  );
}

/**
 * Writes the stored values and nothing else. The main window is the one that
 * reads them and registers the combinations with the OS; a second window doing
 * it too would fight the first for the same keys, so this one does not, and
 * main refuses such a request from it anyway.
 */
export default function KeysSection() {
  const globalKeys = useGlobalShortcutSettings();
  const quickAccess = useQuickAccessShortcutSettings();
  const { effective } = usePresenceSettings();
  const [conflict, setConflict] = useState(false);
  const os = usePlatform();

  useEffect(() => window.instantsSettings?.onConflict?.(() => setConflict(true)), []);

  return (
    <KeysPane
      os={os}
      globalKeys={globalKeys}
      quickAccess={quickAccess}
      quickAccessOn={effective.quickAccess}
      conflict={conflict}
      onClearConflict={() => setConflict(false)}
    />
  );
}

