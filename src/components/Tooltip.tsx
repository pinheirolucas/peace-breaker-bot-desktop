import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { Keys } from "./Key";
import "./overlays.css";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={400}>{children}</RadixTooltip.Provider>;
}

export function Tooltip({ label, keys, children }: { label: string; keys?: string[]; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tip" sideOffset={6}>
          {label}
          {keys && <Keys inv parts={keys} />}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
