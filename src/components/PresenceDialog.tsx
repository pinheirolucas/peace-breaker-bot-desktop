import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GlobalModifier } from "../../electron/shortcuts";
import type { PresenceSettings } from "../../electron/presence";
import { comboLabel } from "../hooks/usePlatform";
import type { PlatformId } from "../themes";
import { Button } from "./Button";
import { Dialog, DialogClose } from "./Dialog";
import { SegmentedChoice } from "./Segmented";
import { Switch } from "./Switch";
import "./presenceDialog.css";

export interface QuickAccessShortcutDraft {
  enabled: boolean;
  modifier: GlobalModifier | null;
}

export interface PresenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  os: PlatformId;
  /** GNOME has no tray: quick access opens from the dock action or the global shortcut. */
  noTray: boolean;
  settings: PresenceSettings;
  shortcut: QuickAccessShortcutDraft;
  /** The combinations this OS offers; empty when the shortcut cannot be registered at all. */
  modifiers: GlobalModifier[];
  /** Nothing is persisted until Pronto, like Aparência. */
  onConfirm: (settings: PresenceSettings, shortcut: QuickAccessShortcutDraft) => void;
}

function Row({
  title,
  hint,
  sub,
  dim,
  children
}: {
  title: string;
  hint?: string;
  sub?: boolean;
  dim?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="prefrow" data-sub={sub || undefined} data-dim={dim || undefined}>
      <div className="preftx">
        <b>{title}</b>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Barra de menus: the tray icon, the quick access, and how they behave. */
export default function PresenceDialog({
  open,
  onOpenChange,
  os,
  noTray,
  settings,
  shortcut,
  modifiers,
  onConfirm
}: PresenceDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings);
  const [key, setKey] = useState(shortcut);

  // Every opening starts from what is stored; a cancelled draft is dropped.
  useEffect(() => {
    if (open) {
      setDraft(settings);
      setKey(shortcut);
    }
    // Only the opening resets the draft, not a stored value changing under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (next: Partial<PresenceSettings>) => setDraft((current) => ({ ...current, ...next }));
  const trayOn = draft.tray;
  const quickAccessOn = trayOn && draft.quickAccess;
  const canShortcut = modifiers.length > 0;
  const modifier = key.modifier ?? modifiers[0] ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("menuBar.title")}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">{t("common.cancel")}</Button>
          </DialogClose>
          <Button onClick={() => onConfirm({ ...draft, quickAccess: quickAccessOn, title: trayOn && draft.title }, { ...key, modifier })}>
            {t("menuBar.done")}
          </Button>
        </>
      }
    >
      <div className="prefs">
        <Row title={t("menuBar.tray")} hint={t("menuBar.trayHint")}>
          <Switch label="" ariaLabel={t("menuBar.tray")} checked={draft.tray} onCheckedChange={(tray) => patch({ tray })} />
        </Row>

        <Row
          sub
          title={t("menuBar.quickAccess")}
          hint={trayOn ? t("menuBar.quickAccessHint") : t("menuBar.quickAccessNeedsTray")}
          dim={!trayOn}
        >
          <Switch label="" ariaLabel={t("menuBar.quickAccess")} checked={quickAccessOn} disabled={!trayOn} onCheckedChange={(quickAccess) => patch({ quickAccess })} />
        </Row>
        {noTray && <p className="prefnote">{t("menuBar.noTray")}</p>}

        <Row sub title={t("menuBar.style")} hint={t("menuBar.styleHint")} dim={!quickAccessOn}>
          <SegmentedChoice
            aria-label={t("menuBar.style")}
            value={draft.quickAccessStyle}
            onChange={(quickAccessStyle) => patch({ quickAccessStyle })}
            options={[
              { value: "favorites", label: t("quickAccess.styleFavorites") },
              { value: "connection", label: t("quickAccess.styleConnection") }
            ]}
          />
        </Row>

        <Row sub title={t("menuBar.click")} hint={t("menuBar.clickHint")} dim={!quickAccessOn || draft.quickAccessStyle !== "favorites"}>
          <SegmentedChoice
            aria-label={t("menuBar.click")}
            value={draft.quickAccessClick}
            onChange={(quickAccessClick) => patch({ quickAccessClick })}
            options={[
              { value: "local", label: t("menuBar.clickLocal") },
              { value: "discord", label: t("menuBar.clickDiscord") }
            ]}
          />
        </Row>

        {canShortcut && (
          <>
            <Row
              sub
              title={t("menuBar.shortcut")}
              hint={quickAccessOn ? t("menuBar.shortcutHint") : t("menuBar.shortcutNeedsQuickAccess")}
              dim={!quickAccessOn}
            >
              <Switch
                label=""
                ariaLabel={t("menuBar.shortcut")}
                checked={key.enabled && quickAccessOn}
                disabled={!quickAccessOn}
                onCheckedChange={(enabled) => setKey((current) => ({ ...current, enabled }))}
              />
            </Row>
            <Row sub title={t("menuBar.combo")} hint={t("menuBar.comboHint")} dim={!(key.enabled && quickAccessOn)}>
              <SegmentedChoice
                aria-label={t("menuBar.combo")}
                value={modifier ?? modifiers[0]}
                onChange={(next) => setKey((current) => ({ ...current, modifier: next }))}
                options={modifiers.map((value) => ({
                  value,
                  label: comboLabel(os, value, "P").replace(/\+?P$/, "") + " P"
                }))}
              />
            </Row>
          </>
        )}

        {os === "mac" && (
          <Row title={t("menuBar.nameBeside")} hint={t("menuBar.titleHint")} dim={!trayOn}>
            <Switch label="" ariaLabel={t("menuBar.nameBeside")} checked={trayOn && draft.title} disabled={!trayOn} onCheckedChange={(title) => patch({ title })} />
          </Row>
        )}

        {os !== "mac" && (
          <Row title={t("menuBar.background")} hint={t("menuBar.backgroundHint")}>
            <Switch label="" ariaLabel={t("menuBar.background")} checked={draft.background} onCheckedChange={(background) => patch({ background })} />
          </Row>
        )}
      </div>
    </Dialog>
  );
}
