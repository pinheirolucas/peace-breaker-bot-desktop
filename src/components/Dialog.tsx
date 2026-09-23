import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import "./overlays.css";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Cancel first, confirm second — always. The platform flips the visual
   *  order in CSS, so the DOM order stays the reading order. */
  footer: ReactNode;
  /** A wider dialog whose body scrolls between the title and the footer. */
  wide?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="scrim" />
        <RadixDialog.Content className={wide ? "dlg dlg--wide" : "dlg"}>
          <div className="db">
            <RadixDialog.Title asChild>
              <h2>{title}</h2>
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description asChild>
                <p className="lede">{description}</p>
              </RadixDialog.Description>
            ) : (
              // Radix warns when Content has no Description; say so explicitly
              // rather than leaving a console warning for every plain dialog.
              <RadixDialog.Description />
            )}
            {children}
          </div>
          <div className="df">{footer}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
