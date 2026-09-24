import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { comboParts, shortcutParts } from "../hooks/usePlatform";
import { Key, Keys } from "./Key";

describe("Key", () => {
  it("renders a kbd carrying the base class and its text", () => {
    render(<Key>⌘K</Key>);
    const key = screen.getByText("⌘K");
    expect(key.tagName).toBe("KBD");
    expect(key).toHaveClass("k");
    expect(key.className).toBe("k");
  });

  it("adds one modifier class per flag", () => {
    render(
      <Key quiet card onAccent inv empty pressed rec disabled>
        A
      </Key>
    );
    const key = screen.getByText("A");
    for (const name of ["quiet", "card", "on-accent", "inv", "empty", "pressed", "rec", "dis"]) {
      expect(key).toHaveClass(`k--${name}`);
    }
  });

  it("keeps a caller's class and passes attributes through", () => {
    render(<Key className="pkey" aria-hidden="true">V</Key>);
    const key = document.querySelector(".k");
    expect(key).toHaveClass("pkey");
    expect(key).toHaveAttribute("aria-hidden", "true");
  });

  it("refuses a combo, a space or a plus inside one Key, but takes a comma key", () => {
    for (const bad of ["Shift ,", "Ctrl+F", "⌘ K", "Shift,A", "+"]) {
      expect(() => render(<Key>{bad}</Key>), bad).toThrow(/one physical key/);
    }
    expect(() => render(<Key>,</Key>)).not.toThrow();
    expect(() => render(<Key card empty>{""}</Key>)).not.toThrow();
  });
});

describe("Keys", () => {
  it("draws one Key per part with no separator, and speaks the combo once", () => {
    const { container } = render(<Keys parts={["⇧", ","]} />);
    const group = screen.getByRole("group", { name: "Shift + ," });
    expect(group).toHaveClass("ks");
    expect([...container.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["⇧", ","]);
    expect(group.textContent).toBe("⇧,");
    for (const key of container.querySelectorAll("kbd")) {
      expect(key).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("takes a spoken label and passes the variant to every key", () => {
    const { container } = render(<Keys quiet inv parts={["Ctrl", "K"]} label="Control K" />);
    expect(screen.getByRole("group", { name: "Control K" })).toBeInTheDocument();
    expect(container.querySelectorAll(".k--quiet.k--inv")).toHaveLength(2);
  });
});

describe("combo parts", () => {
  it("puts modifiers first in one order per OS", () => {
    expect(comboParts("mac", "cmd-alt", "v")).toEqual(["⌥", "⌘", "V"]);
    expect(comboParts("mac", "ctrl-alt", "v")).toEqual(["⌃", "⌥", "V"]);
    expect(comboParts("win", "ctrl-alt-shift", "v")).toEqual(["Ctrl", "Alt", "Shift", "V"]);
    expect(comboParts("linux", "super-alt", "v")).toEqual(["Alt", "Super", "V"]);
    expect(shortcutParts("mac", ",")).toEqual(["⌘", ","]);
    expect(shortcutParts("win", "n")).toEqual(["Ctrl", "N"]);
  });
});
