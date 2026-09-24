import type { ReactNode } from "react";
import "./settings.css";

/** A small label over a group of rows. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="gl">{children}</div>;
}

export function Group({ children, ...rest }: { children: ReactNode; role?: string; "aria-label"?: string }) {
  return (
    <div className="grp" {...rest}>
      {children}
    </div>
  );
}

export interface PrefRowProps {
  title: string;
  hint?: string;
  /** Indented under the row it depends on. */
  sub?: boolean;
  /** Its dependency is off: shown at half strength, with the reason as the hint. */
  dim?: boolean;
  /** The control goes on its own line under the text. */
  stack?: boolean;
  children?: ReactNode;
}

/** A setting: what it is and what it does on the left, its control on the right. */
export function PrefRow({ title, hint, sub, dim, stack, children }: PrefRowProps) {
  return (
    <div
      className="prefrow"
      data-sub={sub || undefined}
      data-dim={dim || undefined}
      data-stack={stack || undefined}
    >
      <div className="preftx">
        <b>{title}</b>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function PageTitle({ title, lede }: { title: string; lede?: string }) {
  return (
    <>
      <h1>{title}</h1>
      {lede && <p className="slede">{lede}</p>}
    </>
  );
}
