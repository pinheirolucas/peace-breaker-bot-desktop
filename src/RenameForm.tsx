import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { Field } from "./components/Field";
import { slotFor } from "./lib/slot";
import type { Instant } from "./storage";
import "./components/card.css";
import "./forms.css";

const MIN_NAME = 3;
const MAX_NAME = 80;

export interface RenameFormProps {
  /** The favourite being renamed; null keeps the dialog closed. */
  instant: Instant | null;
  onCancel: () => void;
  onSave: (name: string) => void;
}

/**
 * A name is only a label — the url is the identity — so two favourites may
 * share one and nothing here touches the backend. The preview is the real
 * card head at its real size, because the card clips a name at two lines and
 * whoever is typing should see that before saving.
 */
export default function RenameForm({ instant, onCancel, onSave }: RenameFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [clipped, setClipped] = useState(false);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const open = instant !== null;
  const url = instant?.url;

  // Every open starts from the current name rather than the last one typed.
  useLayoutEffect(() => {
    if (instant) {
      setName(instant.name);
      setTouched(false);
    }
    // Keyed on the url: a save rewrites instant.name, which must not reset an
    // open dialog, and a different favourite must.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const trimmed = name.trim();
  const valid = trimmed.length >= MIN_NAME;
  const changed = instant !== null && trimmed !== instant.name;
  const nameError = touched && !valid ? t("save.nameError") : "";

  // The preview's clamp is what decides "too long", not a character count:
  // width depends on the letters and on the platform's font.
  useLayoutEffect(() => {
    const el = previewRef.current;
    setClipped(Boolean(el) && el!.scrollHeight > el!.clientHeight + 1);
  }, [trimmed, open]);

  function submit() {
    if (!valid) {
      setTouched(true);
      return;
    }

    if (changed) {
      onSave(trimmed);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={t("rename.title")}
      description={t("rename.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          {/* Dead until the name passes and differs from the current one. */}
          <Button onClick={submit} disabled={!valid || !changed}>
            {t("save.action")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onKeyDown={handleKeyDown}
        style={{ display: "grid", gap: 12 }}
      >
        <Field
          label={t("save.nameLabel")}
          value={name}
          error={nameError}
          maxLength={MAX_NAME}
          autoFocus
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            setName(event.target.value);
            setTouched(true);
          }}
        />
        {valid && clipped && <p className="hint">{t("rename.longHint")}</p>}
        <div>
          <p className="preview-label">{t("rename.previewLabel")}</p>
          {instant && (
            <div className={`pad mini ${slotFor(instant.url)}`}>
              <h3 className="pname" ref={previewRef}>
                {trimmed || instant.name}
              </h3>
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}
