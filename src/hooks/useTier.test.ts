import { describe, expect, it } from "vitest";
import { tierForWidth } from "./useTier";

// The same boundaries as the container queries in src/styles/shell.css.
describe("tierForWidth", () => {
  it.each([
    [1600, "roomy"],
    [880, "roomy"],
    [879, "snug"],
    [600, "snug"],
    [599, "tight"],
    [400, "tight"],
    [360, "tight"]
  ])("puts %ipx in %s", (width, tier) => {
    expect(tierForWidth(width)).toBe(tier);
  });

  it("reads an unmeasured width as the roomiest tier", () => {
    expect(tierForWidth(0)).toBe("roomy");
  });
});
