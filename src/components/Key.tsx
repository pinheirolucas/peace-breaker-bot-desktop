import type { HTMLAttributes } from "react";
import "./key.css";

export interface KeyProps extends HTMLAttributes<HTMLElement> {
  /** Smaller and muted: a hint beside a control rather than a control's own key. */
  quiet?: boolean;
  /** The corner of an instant card, tinted with the card's own ink. */
  card?: boolean;
  /** On an accent ground (a selected row, an active button). */
  onAccent?: boolean;
  /** On an inverted ground (a tooltip or toast). */
  inv?: boolean;
  /** An unassigned slot. */
  empty?: boolean;
  /** The key is down. */
  pressed?: boolean;
  /** Listening for the next key. */
  rec?: boolean;
  dis?: boolean;
}

const MODIFIERS = ["quiet", "card", "onAccent", "inv", "empty", "pressed", "rec", "dis"] as const;
const CLASS: Record<(typeof MODIFIERS)[number], string> = {
  quiet: "k--quiet",
  card: "k--card",
  onAccent: "k--on-accent",
  inv: "k--inv",
  empty: "k--empty",
  pressed: "k--pressed",
  rec: "k--rec",
  dis: "k--dis"
};

/** A key hint. The one place a key is drawn; see `key.css`. */
export function Key({ quiet, card, onAccent, inv, empty, pressed, rec, dis, className, ...rest }: KeyProps) {
  const on = { quiet, card, onAccent, inv, empty, pressed, rec, dis };
  const classes = ["k", ...MODIFIERS.filter((m) => on[m]).map((m) => CLASS[m]), className];
  return <kbd className={classes.filter(Boolean).join(" ")} {...rest} />;
}
