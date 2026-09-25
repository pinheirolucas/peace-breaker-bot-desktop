import { describe, expect, it } from "vitest";
import contract from "./botContract.json";
import enUS from "./i18n/en-US.json";
import ptBR from "./i18n/pt-BR.json";

// Every non-test module that can talk to the bot, as raw text.
const sources = import.meta.glob(["./**/*.{ts,tsx}", "../electron/**/*.ts", "!./**/*.test.*", "!./**/*.stories.*"], {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

/** `${base}/instants/${encodeURIComponent(url)}/content?x` → `/instants/{}/content` */
function calledPaths(): Set<string> {
  const paths = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const match of text.matchAll(/\$\{\w+\}(\/(?:bot|instants|providers)[^`?]*)/g)) {
      paths.add(normalize(match[1]));
    }
  }
  return paths;
}

const normalize = (path: string) => path.replace(/\$\{[^}]*\}|\{[^}]*\}/g, "{}");
const pathOf = (route: string) => normalize(route.split(" ")[1]);

describe("bot contract (src/botContract.json, from scripts/sync-bot-contract.mts)", () => {
  it.each(contract.labels)("translates the bot's %s label in both languages", label => {
    expect(enUS.api).toHaveProperty(label);
    expect(ptBR.api).toHaveProperty(label);
  });

  it("only calls routes the bot serves", () => {
    const served = new Set(contract.routes.map(pathOf));
    expect([...calledPaths()].filter(path => !served.has(path))).toEqual([]);
  });

  it("calls every route the bot serves, or lists it as known-unused", () => {
    const called = calledPaths();
    const unaccounted = contract.routes.filter(
      route => !called.has(pathOf(route)) && !contract.knownUnused.includes(route)
    );
    expect(unaccounted).toEqual([]);
  });
});
