import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { clipKeyFromEvent } from "../lib/clipKeys";
import type { Instant } from "../storage";
import "./shortcuts.css";

/** What the dialog says about the key outside the app, when global keys are on. */
export interface GlobalHint {
  /** The full combo for a key, as a person reads it. */
  combo: (key: string) => string;
  /** Another app holds the combo for this key. */
  inUse: (key: string) => boolean;
}

export interface ShortcutDialogProps {
  /** The favourite being given a key; null keeps the dialog closed. */
  instant: Instant | null;
  instants: Instant[];
  global?: GlobalHint;
  onCancel: () => void;
  /** null removes the key. */
  onSave: (key: string | null) => void;
}

// Never captured: they keep their meaning. Modifiers alone say nothing yet.
const passThrough = new Set(["Tab", "Escape", "Enter", "Shift", "Control", "Alt", "Meta", "CapsLock"]);

/**
 * One small dialog, opened from the card's keyboard button in Organizar. The
 * capture box has focus when it opens, so the flow is keyboard-only: press
 * the key, press Enter. Cmd, Ctrl and Alt combinations are ignored rather
 * than rejected, so an app shortcut pressed by habit does nothing.
 */
export default function ShortcutDialog({
  instant,
  instants,
  global,
  onCancel,
  onSave
}: ShortcutDialogProps) {
  const { t } = useTranslation();
  const [key, setKey] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const url = instant?.url;

  // Every open starts from the sound's current key.
  useEffect(() => {
    setKey(instant?.key ?? null);
    setRefused(false);
    // Keyed on the url: a save rewrites instant.key, which must not reset an
    // open dialog, and a different favourite must.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const taken = key ? instants.find((item) => item.key === key && item.url !== url) : undefined;
  const changed = key !== null && key !== (instant?.key ?? null);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter") {
      if (changed) {
        event.preventDefault();
        onSave(key);
      }
      return;
    }

    if (passThrough.has(event.key) || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    event.preventDefault();

    const next = clipKeyFromEvent(event.nativeEvent);
    if (next) {
      setKey(next);
      setRefused(false);
    } else {
      setRefused(true);
    }
  }

  const state = refused ? "refused" : key ? "captured" : "waiting";
  const name = instant?.name ?? "";

  return (
    <Dialog
      open={instant !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={t("shortcuts.title", { name })}
      description={t("shortcuts.prompt")}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onSave(key)} disabled={!changed}>
            {t("save.action")}
          </Button>
        </>
      }
    >
      <div className="kcap">
        <button
          type="button"
          className="kcap__box"
          data-state={state}
          autoFocus
          aria-label={t("shortcuts.captureLabel")}
          onKeyDown={handleKeyDown}
        >
          {key && !refused ? key.toUpperCase() : "···"}
        </button>

        {refused ? (
          <p className="kcap__msg" role="alert" data-tone="error">
            <strong>{t("shortcuts.badKey")}</strong>
            <span>{t("shortcuts.badKeyHint")}</span>
          </p>
        ) : key ? (
          <p className="kcap__msg">
            <strong>{t("shortcuts.plays", { key: key.toUpperCase(), name })}</strong>
            {global && !global.inUse(key) && (
              <span>{t("shortcuts.global.outside", { combo: global.combo(key) })}</span>
            )}
          </p>
        ) : (
          <p className="kcap__msg">{t("shortcuts.waiting")}</p>
        )}

        {taken && !refused && (
          <p className="kcap__msg" data-tone="warn">
            {t("shortcuts.taken", { key: key?.toUpperCase(), other: taken.name })}
          </p>
        )}
        {key && !refused && global?.inUse(key) && (
          <p className="kcap__msg" data-tone="warn">
            {t("shortcuts.global.dialogTaken", { combo: global.combo(key) })}
          </p>
        )}

        {instant?.key && (
          <Button variant="ghost" onClick={() => onSave(null)}>
            {t("shortcuts.remove")}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
