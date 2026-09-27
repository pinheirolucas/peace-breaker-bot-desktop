import { describe, expect, it } from "vitest";
import enUS from "./en-US.json";
import ptBR from "./pt-BR.json";

function keys(catalog: object, prefix = ""): string[] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    typeof value === "object" && value !== null ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  );
}

describe("translation catalogs", () => {
  it("have the same keys in en-US and pt-BR", () => {
    expect(keys(ptBR).sort()).toEqual(keys(enUS).sort());
  });
});
