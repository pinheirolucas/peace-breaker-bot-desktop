import type { HTMLAttributes } from "react";
import "./key.css";

export interface KeyProps extends HTMLAttributes<HTMLElement> {
  /** Muted: for a hint that sits beside text and should not compete with it. */
  quiet?: boolean;
  /** On a sound's card: bigger, and drawn in the card's own ink. */
  card?: boolean;
  /** On the accent ground: the selected row of a menu or palette. */
  onAccent?: boolean;
  /** On the inverted ground of a tooltip or a toast. */
  inv?: boolean;
  /** A slot with no key yet: dashed. */
  empty?: boolean;
  /** Filled: the key is down. */
  pressed?: boolean;
  /** Listening for the next key. */
  rec?: boolean;
  disabled?: boolean;
}

/** One Key is one physical key: a space, a "+" or a comma-joined combo in it is a bug, not a style. */
function assertOneKey(children: KeyProps["children"]) {
  if (typeof children !== "string" || !import.meta.env.DEV) {
    return;
  }

  if (/[\s+]/.test(children) || (children.length > 1 && children.includes(","))) {
    throw new Error(`<Key> holds one physical key; got "${children}". Use <Keys parts={[...]}> for a combo.`);
  }
}

/** The one key hint. Every surface that names a key draws it through here. */
export function Key({ quiet, card, onAccent, inv, empty, pressed, rec, disabled, className, ...rest }: KeyProps) {
  assertOneKey(rest.children);
  const classes = [
    "k",
    quiet && "k--quiet",
    card && "k--card",
    onAccent && "k--on-accent",
    inv && "k--inv",
    empty && "k--empty",
    pressed && "k--pressed",
    rec && "k--rec",
    disabled && "k--dis",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return <kbd {...rest} className={classes} />;
}

/** What a screen reader says for a part: the glyphs have names, the rest read as they are. */
const spoken: Record<string, string> = {
  "⌘": "Command",
  "⌥": "Option",
  "⇧": "Shift",
  "⌃": "Control",
  "↵": "Enter",
  "⌫": "Backspace",
  "↑": "Up",
  "↓": "Down"
};

export interface KeysProps extends Omit<KeyProps, "children"> {
  /** One entry per physical key, modifiers first. */
  parts: string[];
  /** What a screen reader says for the whole combo; the parts joined with " + " by default. */
  label?: string;
}

/** A combo: one <Key> per physical key, the gap between them doing the separating. One spoken label on the wrapper, the caps hidden. */
export function Keys({ parts, label, className, ...variant }: KeysProps) {
  return (
    <span className={["ks", className].filter(Boolean).join(" ")} role="group" aria-label={label ?? parts.map((part) => spoken[part] ?? part).join(" + ")}>
      {parts.map((part, index) => (
        <Key key={`${part}-${index}`} {...variant} aria-hidden="true">
          {part}
        </Key>
      ))}
    </span>
  );
}

export default Key;
