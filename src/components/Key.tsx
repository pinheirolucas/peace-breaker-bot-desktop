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

/** The one key hint. Every surface that names a key draws it through here. */
export function Key({ quiet, card, onAccent, inv, empty, pressed, rec, disabled, className, ...rest }: KeyProps) {
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

export default Key;
