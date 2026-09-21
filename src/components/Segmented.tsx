import * as RadixRadio from "@radix-ui/react-radio-group";
import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode, Ref } from "react";
import "./controls.css";

// The pill pair in the hero is a real tablist: Radix gives roving arrow-key
// focus and the tab -> tabpanel aria wiring for free. That wiring only
// exists inside one Root, and the pills and the panel they switch sit far
// apart in the shell — so the Root is its own export, wrapped around both.

export interface SegmentedRootProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
  className?: string;
  /** The root element, for a caller that has to measure it. */
  rootRef?: Ref<HTMLDivElement>;
}

export function SegmentedRoot<T extends string>({
  value,
  onChange,
  children,
  className,
  rootRef
}: SegmentedRootProps<T>) {
  return (
    <Tabs.Root
      ref={rootRef}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className={className}
    >
      {children}
    </Tabs.Root>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** A hover hint, such as the shortcut that switches to this option. */
  title?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  "aria-label": string;
}

export function Segmented<T extends string>({
  options,
  "aria-label": ariaLabel
}: SegmentedProps<T>) {
  return (
    <Tabs.List className="seg" aria-label={ariaLabel}>
      {options.map((option) => (
        <Tabs.Trigger
          key={option.value}
          value={option.value}
          data-tab={option.value}
          title={option.title}
        >
          {option.label}
        </Tabs.Trigger>
      ))}
    </Tabs.List>
  );
}

export const SegmentedPanel = Tabs.Content;

export interface SegmentedChoiceProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  "aria-label": string;
}

/**
 * The same pills as a single choice rather than a tablist — for a setting,
 * such as the colour mode, that switches no panel. A radio group, so arrow
 * keys move and pick, and each pill reports role="radio".
 */
export function SegmentedChoice<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel
}: SegmentedChoiceProps<T>) {
  return (
    <RadixRadio.Root
      className="seg"
      aria-label={ariaLabel}
      orientation="horizontal"
      value={value}
      onValueChange={(next) => onChange(next as T)}
    >
      {options.map((option) => (
        <RadixRadio.Item key={option.value} value={option.value}>
          {option.label}
        </RadixRadio.Item>
      ))}
    </RadixRadio.Root>
  );
}
