import { useTranslation } from "react-i18next";
import type { ShortcutResult } from "../../electron/shortcuts";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { SegmentedChoice } from "./Segmented";
import { Switch } from "./Switch";
import { comboLabel, findShortcutLabel, shortcutLabel } from "../hooks/usePlatform";
import { useGlobalShortcutSettings } from "../hooks/useGlobalShortcuts";
import { slotFor } from "../lib/slot";
import type { PlatformId } from "../themes";
import type { Instant } from "../storage";
import "./shortcuts.css";

export interface ShortcutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instants: Instant[];
  os: PlatformId;
  status: ShortcutResult;
  /** "Definir em Organizar": closes the sheet and enters the mode. */
  onOrganize: () => void;
}

/**
 * Atalhos do teclado, opened with ? or from ⋯. Sounds are sorted by key,
 * digits first, each in its card's colour so it is findable on the grid.
 * The global section exists only where the Electron bridge does.
 */
export default function ShortcutSheet({
  open,
  onOpenChange,
  instants,
  os,
  status,
  onOrganize
}: ShortcutSheetProps) {
  const { t } = useTranslation();
  const global = useGlobalShortcutSettings();

  const keyed = instants
    .filter((instant): instant is Instant & { key: string } => Boolean(instant.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  const unkeyed = instants.length - keyed.length;

  const failure = (key: string) => status.failed.find((item) => item.key === key)?.reason;
  const unsupported = status.failed.some(({ reason }) => reason === "unsupported");
  const showCombo = global.available && global.enabled && global.modifier !== null;

  const appKeys: [string, string][] = [
    [t("shortcuts.sheet.stop"), "Esc"],
    [t("shortcuts.sheet.find"), findShortcutLabel(os)],
    [t("app.tabFavorites"), shortcutLabel(os, "1")],
    [t("app.tabExplore"), shortcutLabel(os, "2")],
    [t("shortcuts.sheet.add"), shortcutLabel(os, "n")],
    [t("shortcuts.sheet.list"), "?"]
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("shortcuts.sheet.title")}
      description={
        global.available ? t("shortcuts.global.lede") : t("shortcuts.sheet.lede")
      }
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t("shortcuts.sheet.close")}
        </Button>
      }
    >
      <div className="ksheet">
        {global.available && global.modifier && (
          <div className="ksheet__global">
            <Switch
              label={t("shortcuts.global.switch")}
              checked={global.enabled}
              onCheckedChange={global.setEnabled}
            />
            <p className="ksheet__note">{t("shortcuts.global.switchHint")}</p>
            {global.enabled && (
              <div className="ksheet__field">
                <span>{t("shortcuts.global.modifier")}</span>
                <SegmentedChoice
                  aria-label={t("shortcuts.global.modifier")}
                  value={global.modifier}
                  onChange={global.setModifier}
                  options={global.modifiers.map((modifier) => ({
                    value: modifier,
                    label: comboLabel(os, modifier, "").replace(/\+$/, "")
                  }))}
                />
              </div>
            )}
            {unsupported && <p className="ksheet__note">{t("shortcuts.global.unsupported")}</p>}
          </div>
        )}

        <section className="ksheet__section" aria-label={t("shortcuts.sheet.yourSounds")}>
          <h3 className="ksheet__h">{t("shortcuts.sheet.yourSounds")}</h3>
          {keyed.length > 0 && (
            <ul className="ksheet__list">
              {keyed.map((instant) => {
                const reason = showCombo ? failure(instant.key) : undefined;
                return (
                  <li key={instant.url} className="ksheet__row">
                    <span className={`ksheet__cap ${slotFor(instant.url)}`}>
                      {instant.key.toUpperCase()}
                    </span>
                    <span title={instant.name}>{instant.name}</span>
                    {showCombo && global.modifier && (
                      <span className="ksheet__combo">
                        <span className="ksheet__dot" data-status={reason ?? "ok"} aria-hidden="true" />
                        {comboLabel(os, global.modifier, instant.key)}
                        {reason && <span>· {t("shortcuts.global.inUse")}</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="ksheet__note">
            {t("shortcuts.sheet.shiftHint")}
            {unkeyed > 0 && <> {t("shortcuts.sheet.unkeyed", { count: unkeyed })} · </>}
            {instants.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  onOpenChange(false);
                  onOrganize();
                }}
              >
                {t("shortcuts.sheet.setInOrganize")}
              </Button>
            )}
          </p>
          {showCombo && <p className="ksheet__note">{t("shortcuts.global.inUseNote")}</p>}
        </section>

        <section className="ksheet__section" aria-label={t("shortcuts.sheet.inApp")}>
          <h3 className="ksheet__h">{t("shortcuts.sheet.inApp")}</h3>
          <ul className="ksheet__list">
            {appKeys.map(([label, keys]) => (
              <li key={label} className="ksheet__row">
                <span className="ksheet__cap ksheet__cap--plain">{keys}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
