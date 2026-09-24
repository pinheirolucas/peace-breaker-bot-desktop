import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Key } from "./Key";

describe("Key", () => {
  it("renders a kbd carrying the shared class", () => {
    render(<Key>A</Key>);
    const key = screen.getByText("A");
    expect(key.tagName).toBe("KBD");
    expect(key).toHaveClass("k");
    expect(key.className).toBe("k");
  });

  it("maps modifiers to classes and keeps a caller's class and attributes", () => {
    render(
      <Key quiet onAccent empty className="kc" data-empty>
        x
      </Key>
    );
    const key = screen.getByText("x");
    expect(key).toHaveClass("k", "k--quiet", "k--on-accent", "k--empty", "kc");
    expect(key).toHaveAttribute("data-empty");
  });
});
