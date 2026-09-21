import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import "./overlays.css";

export interface MenuProps {
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
  /** Added to `menu`, e.g. `menu--scroll` for a list too long to fit. */
  className?: string;
  /** Runs when the menu has closed and would hand focus back to its
   *  trigger. `preventDefault()` keeps it, for a menu that closes only to
   *  open something else. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function Menu({
  trigger,
  open,
  onOpenChange,
  children,
  align = "end",
  className,
  onCloseAutoFocus
}: MenuProps) {
  return (
    <RadixMenu.Root open={open} onOpenChange={onOpenChange}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          className={["menu", className].filter(Boolean).join(" ")}
          align={align}
          sideOffset={6}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

export interface MenuItemProps {
  onSelect?: () => void;
  disabled?: boolean;
  tick?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  closeOnSelect?: boolean;
  trail?: ReactNode;
  trailLabel?: string;
  onTrailSelect?: () => void;
}

export function MenuItem({
  onSelect,
  disabled,
  tick,
  primary,
  secondary,
  closeOnSelect = true,
  trail,
  trailLabel,
  onTrailSelect
}: MenuItemProps) {
  return (
    <RadixMenu.Item
      className="mitem"
      disabled={disabled}
      onSelect={(event) => {
        if (!closeOnSelect) {
          event.preventDefault();
        }
        onSelect?.();
      }}
    >
      {tick !== undefined && <span className="mtick">{tick}</span>}
      <span className="mtxt">
        {primary}
        {secondary && <span className="msub">{secondary}</span>}
      </span>
      {trail !== undefined && (
        <button
          type="button"
          className="mtrail"
          aria-label={trailLabel}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onTrailSelect?.();
          }}
        >
          {trail}
        </button>
      )}
    </RadixMenu.Item>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="msep" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className="mlabel">{children}</RadixMenu.Label>;
}
