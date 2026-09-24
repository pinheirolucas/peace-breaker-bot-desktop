import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Key } from "./Key";

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
});
