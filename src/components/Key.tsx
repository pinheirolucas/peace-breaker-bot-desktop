import type { HTMLAttributes, ReactNode } from "react";
import "./key.css";

export interface KeyProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  children?: ReactNode;
  /** Inside a line of text or a control: smaller, no face. */
  quiet?: boolean;
  /** On a sound's own colour (`--fill`/`--ink`). */
  card?: boolean;
  /** On an accent ground. */
  onAccent?: boolean;
  /** On an inverted ground, such as a tooltip. */
  inv?: boolean;
  /** An empty slot: dashed, no face. */
  empty?: boolean;
  pressed?: boolean;
  /** Waiting for a key. */
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

/** The one key hint. Every surface that shows a key draws it with this. */
export function Key({ children, className, quiet, card, onAccent, inv, empty, pressed, rec, dis, ...rest }: KeyProps) {
  const on = { quiet, card, onAccent, inv, empty, pressed, rec, dis };
  const classes = ["k", ...MODIFIERS.filter((m) => on[m]).map((m) => CLASS[m]), className];
  return (
    <kbd className={classes.filter(Boolean).join(" ")} {...rest}>
      {children}
    </kbd>
  );
}
