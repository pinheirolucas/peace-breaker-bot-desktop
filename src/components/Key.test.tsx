import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Key } from "./Key";

describe("Key", () => {
  it("renders a kbd with the base class", () => {
    render(<Key>F</Key>);
    const key = screen.getByText("F");
    expect(key.tagName).toBe("KBD");
    expect(key).toHaveClass("k");
  });

  it("maps modifiers to classes", () => {
    render(
      <Key quiet onAccent empty className="extra">
        ↵
      </Key>
    );
    expect(screen.getByText("↵")).toHaveClass("k", "k--quiet", "k--on-accent", "k--empty", "extra");
  });

  it("adds no modifier by default", () => {
    render(<Key>A</Key>);
    expect(screen.getByText("A").className).toBe("k");
  });
});
