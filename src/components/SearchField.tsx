import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { SearchIcon } from "../icons";
import { Key } from "./Key";
import "./controls.css";

export interface SearchFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** The find shortcut, rendered as a hint. Per-platform: on macOS the
   *  modifier is Cmd, and showing "Ctrl+F" there would be wrong twice over. */
  shortcut?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchField({ shortcut, className, ...rest }, ref) {
    return (
      // A label, so a click anywhere on the field — including the magnifier
      // that is all a Tight window shows of it — lands in the input.
      <label
        className={["search", className].filter(Boolean).join(" ")}
        data-filled={Boolean(rest.value) || undefined}
      >
        <SearchIcon style={{ flex: "none" }} />
        <input ref={ref} type="search" {...rest} />
        {shortcut && <Key quiet className="search__key">{shortcut}</Key>}
      </label>
    );
  }
);
