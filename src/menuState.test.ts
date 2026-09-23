import { describe, expect, it } from "vitest";
import { httpsUrl, isCardContext, isMenuCommand, isMenuState, isServerRowContext } from "../electron/menuState";
import { initialMenuState } from "../electron/menuTemplates";

const valid = () => ({
  ...initialMenuState("pt-BR"),
  servers: [{ id: "a", address: "192.168.1.20:9001", isLocal: true, manual: false, active: true }],
  providers: [{ key: "myinstants", name: "MyInstants" }],
  provider: "myinstants",
  regions: [{ code: "br", label: "Brasil" }],
  globalKeys: { available: true, enabled: true, modifier: "ctrl-alt-shift" }
});

describe("isMenuState", () => {
  it("accepts what the renderer really sends", () => {
    expect(isMenuState(valid(), "win32")).toBe(true);
    expect(isMenuState(initialMenuState("en-US"), "darwin")).toBe(true);
  });

  it("keeps unknown bot status distinct from false", () => {
    expect(isMenuState({ ...valid(), botConnected: null }, "win32")).toBe(true);
    expect(isMenuState({ ...valid(), botConnected: false }, "win32")).toBe(true);
    expect(isMenuState({ ...valid(), botConnected: "no" }, "win32")).toBe(false);
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["an unknown tab", { ...valid(), tab: "settings" }],
    ["an unknown language", { ...valid(), language: "fr-FR" }],
    ["a bad playing value", { ...valid(), playing: "both" }],
    ["a region that is not two lowercase letters", { ...valid(), region: "BRA" }],
    ["a region entry that is not", { ...valid(), regions: [{ code: "Br", label: "x" }] }],
    ["a missing flag", { ...valid(), organizing: undefined }],
    ["an over-long label", { ...valid(), activeAddress: "x".repeat(400) }],
    ["too many servers", { ...valid(), servers: Array.from({ length: 65 }, (_, i) => ({ id: String(i), address: "a", isLocal: false, manual: false, active: false })) }],
    ["a malformed server", { ...valid(), servers: [{ id: "a" }] }],
    ["an unknown organize reason", { ...valid(), organizeBlocked: "because" }]
  ])("rejects %s", (_name, state) => {
    expect(isMenuState(state, "win32")).toBe(false);
  });

  it("only takes a modifier preset the OS offers", () => {
    const withModifier = (modifier: string) => ({ ...valid(), globalKeys: { available: true, enabled: false, modifier } });

    expect(isMenuState(withModifier("ctrl-alt"), "win32")).toBe(true);
    expect(isMenuState(withModifier("cmd-alt"), "win32")).toBe(false);
    expect(isMenuState(withModifier("cmd-alt"), "darwin")).toBe(true);
    expect(isMenuState(withModifier("ctrl-alt-shift; rm"), "linux")).toBe(false);
  });
});

describe("isCardContext", () => {
  const card = {
    surface: "favorites",
    url: "https://www.myinstants.com/pt/instant/vine-boom/",
    name: "Vine boom",
    playback: "idle",
    state: { playDisabled: false, discordDisabled: false, botGated: false, stopDisabled: true, trailDisabled: false },
    key: "a",
    organizing: false,
    favorite: true,
    providerName: "",
    index: 0,
    total: 3,
    width: 156
  };

  it("accepts a card's state, with or without a key", () => {
    expect(isCardContext(card)).toBe(true);
    expect(isCardContext({ ...card, key: null })).toBe(true);
  });

  it.each([
    ["a key that is not a letter or digit", { key: "ab" }],
    ["punctuation as a key", { key: "/" }],
    ["an unknown surface", { surface: "settings" }],
    ["an unknown playback", { playback: "everywhere" }],
    ["an index past the end", { index: 3 }],
    ["a negative index", { index: -1 }],
    ["an over-long url", { url: "https://x.test/" + "a".repeat(2100) }],
    ["a non-boolean flag", { state: { ...card.state, playDisabled: 1 } }]
  ])("rejects %s", (_name, patch) => {
    expect(isCardContext({ ...card, ...patch })).toBe(false);
  });
});

describe("isMenuCommand", () => {
  it("accepts the commands main sends", () => {
    for (const command of [
      { type: "find" },
      { type: "tab", tab: "explore" },
      { type: "language", language: "en-US" },
      { type: "region", region: "us" },
      { type: "global-enabled", enabled: true },
      { type: "card", surface: "explore", action: "toggle-favorite", url: "u", width: 100 }
    ]) {
      expect(isMenuCommand(command)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const command of [
      null,
      "find",
      { type: "eval" },
      { type: "tab", tab: "nope" },
      { type: "region", region: "BR" },
      { type: "card", surface: "favorites", action: "explode", url: "u", width: 1 },
      { type: "global-enabled", enabled: "yes" }
    ]) {
      expect(isMenuCommand(command)).toBe(false);
    }
  });
});

describe("isServerRowContext and httpsUrl", () => {
  it("wants a string id", () => {
    expect(isServerRowContext({ id: "http://a:9001/api/v1" })).toBe(true);
    expect(isServerRowContext({ id: 3 })).toBe(false);
  });

  it("lets only https through to the shell", () => {
    expect(httpsUrl("https://www.myinstants.com/pt/instant/x/")).toBe("https://www.myinstants.com/pt/instant/x/");
    expect(httpsUrl("http://www.myinstants.com/")).toBeNull();
    expect(httpsUrl("file:///etc/passwd")).toBeNull();
    expect(httpsUrl("javascript:alert(1)")).toBeNull();
    expect(httpsUrl("not a url")).toBeNull();
    expect(httpsUrl(42)).toBeNull();
  });
});
