import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import OrganizeButton from "./OrganizeButton";

// A Tight window hides the word and keeps the icon (see shell.css). Hidden
// text is not part of the accessible name, so the name is set explicitly.
describe("OrganizeButton", () => {
  it("names itself with an explicit aria-label, independent of its visible word", () => {
    render(<OrganizeButton blockedReason={null} onClick={() => {}} />);

    expect(screen.getByRole("button", { name: "Organizar" })).toHaveAttribute(
      "aria-label",
      "Organizar"
    );
  });
});
