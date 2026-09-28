import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import { matchEntries, searchEntries, sectionLabel } from "./search";

function find(language: string, query: string): string[] {
  const t = i18n.getFixedT(language);
  return matchEntries(searchEntries(t, "mac"), query, (section) => sectionLabel(t, section, "mac")).map(({ id }) => id);
}

describe("settings search", () => {
  it("finds favourites sync in both languages", () => {
    expect(find("en-US", "sync")).toContain("sync");
    expect(find("pt-BR", "sincronizar")).toContain("sync");
    expect(find("pt-BR", "sincronização")).toContain("sync");
  });
});
