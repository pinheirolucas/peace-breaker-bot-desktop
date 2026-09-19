import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { Field } from "./components/Field";
import InstantCard from "./components/InstantCard";
import { TrashIcon } from "./icons";
import type { Instant } from "./storage";
import "./forms.css";

const MIN_NAME = 3;
const MAX_NAME = 80;

export interface RenameFormProps {
  /** The favourite being renamed; null keeps the dialog closed. */
  instant: Instant | null;
  /** The card's width in the grid, so the preview wraps and clips the name
   *  exactly as the real card will. Absent or 0 fills the dialog. */
  cardWidth?: number;
  onCancel: () => void;
  onSave: (name: string) => void;
}

const noop = () => undefined;

/** The address without the scheme and www, which only add width. */
function displayUrl(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

/**
 * A name is only a label — the url is the identity — so two favourites may
 * share one and nothing here touches the backend. The preview is the real
 * InstantCard, footer and waveform included, at the width it has in the grid:
 * the card clips a name at two lines and its waveform is drawn from the name,
 * so whoever is typing should see all of it before saving. It is inert, so
 * none of its buttons do anything.
 */
export default function RenameForm({ instant, cardWidth, onCancel, onSave }: RenameFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [clipped, setClipped] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
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
    const el = previewRef.current?.querySelector<HTMLElement>(".pname");
    setClipped(Boolean(el) && el!.scrollHeight > el!.clientHeight + 1);
  }, [trimmed, open, cardWidth]);

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
        // minmax(0, …): a plain grid column is min-content wide, so one long
        // unbreakable address would stretch the whole dialog past its edge.
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}
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
            // inert: every button on the real card is drawn, none is live —
            // no click, no focus stop, nothing for a screen reader to repeat.
            <div
              ref={previewRef}
              inert
              className="preview-card"
              style={cardWidth ? { width: cardWidth } : undefined}
            >
              <InstantCard
                instant={{ name: trimmed || instant.name, url: instant.url }}
                playback="idle"
                otherPlaying={false}
                botStatus={null}
                onPlay={noop}
                onPlayOnDiscord={noop}
                onStop={noop}
                trail={{ label: t("favorites.remove"), icon: <TrashIcon />, onClick: noop }}
              />
            </div>
          )}
          {instant && (
            <p className="preview-link" title={instant.url}>
              {displayUrl(instant.url)}
            </p>
          )}
        </div>
      </form>
    </Dialog>
  );
}
