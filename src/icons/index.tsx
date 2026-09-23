// Lifted from the design canvas markup, which already draws every icon this
// app uses. They were @mui/icons-material before; owning them means they
// keep whatever test hooks we give them in every build, rather than losing
// data-testid in production the way createSvgIcon does.

import type { SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false
  } as const;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round"
} as const;

export function SendIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...stroke} {...rest}>
      <path d="M20.6 3.4 3.4 10.1l6.7 2.8 2.8 6.7z" />
      <path d="M20.6 3.4 10.1 12.9" />
    </svg>
  );
}

export function StopIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="currentColor" {...rest}>
      <rect x="6.8" y="6.8" width="10.4" height="10.4" rx="2.4" />
    </svg>
  );
}

export function TrashIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...stroke} {...rest}>
      <path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M7 7.6 7.9 19a1.2 1.2 0 0 0 1.2 1.1h5.8a1.2 1.2 0 0 0 1.2-1.1L17 7.6" />
    </svg>
  );
}

export function StarIcon({ size = 16, filled = false, ...rest }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(size)} {...stroke} fill={filled ? "currentColor" : "none"} {...rest}>
      <path d="m12 4 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" />
    </svg>
  );
}

export function SearchIcon({ size = 17, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...rest}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.7 15.7 4.3 4.3" />
    </svg>
  );
}

/** Three dots in a row: the overflow menu on macOS and Windows. Linux draws
 *  the hamburger below instead, which is what its main menu looks like. */
export function MoreIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="currentColor" {...rest}>
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </svg>
  );
}

export function MenuIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...rest}>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
    </svg>
  );
}

/** The small arrow on a split button or a menu trigger. */
export function ChevronDownIcon({ size = 13, ...rest }: IconProps) {
  return (
    <svg
      {...base(size)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

/** Two sliders: a filter, without saying what it filters by. */
export function FilterIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...stroke} {...rest}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

export function CheckIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function RefreshIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...stroke} {...rest}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V10h-5.5" />
    </svg>
  );
}

export function PlusIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ErrorIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...rest}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 8.3 7.4 7.4" />
    </svg>
  );
}

export function CloseIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...rest}>
      <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />
    </svg>
  );
}

/** The app mark in the Windows title bar — a cassette, matching Fita. */
export function AppMarkIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.6" />
      <circle cx="16.5" cy="16" r="2.6" />
    </svg>
  );
}

export function PencilIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...stroke} {...rest}>
      <path d="M4 20h4.2L19.4 8.8a2.4 2.4 0 0 0-3.4-3.4L4.8 16.6z" />
      <path d="m14.4 7 3.4 3.4" />
    </svg>
  );
}

/** Decoration on a card in Organizar: the whole card is the drag target. */
export function GripIcon({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="currentColor" {...rest}>
      <circle cx="9" cy="6" r="1.7" />
      <circle cx="15" cy="6" r="1.7" />
      <circle cx="9" cy="12" r="1.7" />
      <circle cx="15" cy="12" r="1.7" />
      <circle cx="9" cy="18" r="1.7" />
      <circle cx="15" cy="18" r="1.7" />
    </svg>
  );
}

/** Tiles and a slot: outlined tiles, one filled and one dashed slot, echoing
 *  the ghost a card leaves while it is dragged. Drawn at 16px, where the
 *  dashes are what tell it apart from a plain layout-grid icon. */
export function ReorderIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...stroke} {...rest}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" strokeDasharray="2.2 2.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" fill="currentColor" />
    </svg>
  );
}

export function KeyboardIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...stroke} {...rest}>
      <rect x="3" y="6.5" width="18" height="11" rx="2.2" />
      <path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M8 14h8" />
    </svg>
  );
}
