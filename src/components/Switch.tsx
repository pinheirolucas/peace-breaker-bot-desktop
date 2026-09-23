import * as RadixSwitch from "@radix-ui/react-switch";
import "./controls.css";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
  /** For a switch whose visible text lives elsewhere (a settings row). */
  ariaLabel?: string;
}

/** Radix reports role="switch", same as MUI's did, so existing test queries
 *  that ask for getByRole("switch") keep working. */
export function Switch({ checked, onCheckedChange, label, id, disabled, ariaLabel }: SwitchProps) {
  return (
    <label className="opt" data-disabled={disabled || undefined}>
      <RadixSwitch.Root
        id={id}
        className="sw"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onCheckedChange={onCheckedChange}
      >
        <RadixSwitch.Thumb className="thumb" />
      </RadixSwitch.Root>
      {label}
    </label>
  );
}
