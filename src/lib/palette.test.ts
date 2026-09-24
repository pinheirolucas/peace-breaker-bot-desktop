import { describe, expect, it, vi } from "vitest";
import { arrange, filterThemes, flatten, matchRank, normalize, parseQuery, pushRecent } from "./palette";
import type { PaletteCandidates, PaletteItem, PaletteLabels } from "./palette";

const labels: PaletteLabels = {
  recents: "Recentes",
  recentsNote: "do mais novo",
  playing: "Tocando agora",
  sounds: "Sons",
  soundsNote: (shown, total) => `${shown} de ${total}`,
  explore: "Explorar",
  actions: "Ações",
  settings: "Configurações",
  servers: "Servidor"
};

const item = (id: string, title: string, patch: Partial<PaletteItem> = {}): PaletteItem => ({
  id,
  kind: "action",
  title,
  run: vi.fn(),
  ...patch
});
const sound = (title: string, key?: string) => item(`s:${title}`, title, { kind: "sound", glyph: key });

function candidates(patch: Partial<PaletteCandidates> = {}): PaletteCandidates {
  const sounds = [sound("Vine boom", "v"), sound("Airhorn", "a"), sound("Bonk", "k"), sound("Bom dia"), sound("Sad trombone", "s"), sound("Boa noite")];

  return {
    recents: sounds.slice(0, 3),
    sounds,
    explore: (query) => item("explore", `Buscar “${query}”`, { kind: "explore" }),
    actions: [
      item("add", "Adicionar um som", { keywords: "novo favorito" }),
      item("organize", "Organizar favoritos", { keywords: "ordenar" }),
      item("explore-tab", "Ir para Explorar", { keywords: "catalogo" }),
      item("settings", "Abrir Configurações"),
      item("find", "Focar a busca")
    ],
    defaultActions: 4,
    settings: [
      item("section:general", "Configurações › Geral", { kind: "action", keywords: "idioma" }),
      item("section:server", "Configurações › Servidor", { keywords: "bot endereco" }),
      item("mode:dark", "Modo: Escuro", { kind: "setting", keywords: "escuro dark tema" }),
      item("lang:en", "Idioma: English", { kind: "setting", keywords: "language" })
    ],
    servers: [item("srv:a", "Servidor: 192.168.0.12:9001", { kind: "setting", keywords: "servidor trocar" })],
    ...patch
  };
}

const ids = (groups: ReturnType<typeof arrange>) => groups.map((g) => [g.id, g.items.map((i) => i.id)]);

describe("normalize and matchRank", () => {
  it("ignores case and accents", () => {
    expect(normalize("Configurações")).toBe("configuracoes");
    expect(normalize("ÁRVORE")).toBe("arvore");
  });

  it("ranks a title prefix over a word prefix over the middle, then keywords", () => {
    expect(matchRank("Bom dia", undefined, "bo")).toBe(0);
    expect(matchRank("Vine boom", undefined, "bo")).toBe(1);
    expect(matchRank("Vine boom", undefined, "oo")).toBe(2);
    expect(matchRank("Organizar", "ordenar", "ord")).toBe(3);
    expect(matchRank("Organizar", "reordenar", "ord")).toBe(4);
    expect(matchRank("Organizar", "reordenar", "zzz")).toBe(-1);
  });

  it("matches everything when nothing is typed", () => {
    expect(matchRank("Qualquer", undefined, "")).toBeGreaterThanOrEqual(0);
  });
});

describe("parseQuery", () => {
  it("takes a leading > as the actions-only mode", () => {
    expect(parseQuery(" >  Idioma ")).toEqual({ query: "idioma", commands: true });
    expect(parseQuery("Idioma")).toEqual({ query: "idioma", commands: false });
    expect(parseQuery("")).toEqual({ query: "", commands: false });
  });
});

describe("arrange", () => {
  it("shows the three recents and four actions with nothing typed, and no settings", () => {
    const groups = arrange("", candidates(), labels);

    expect(ids(groups)).toEqual([
      ["recents", ["s:Vine boom", "s:Airhorn", "s:Bonk"]],
      ["actions", ["add", "organize", "explore-tab", "settings"]]
    ]);
    expect(groups[0].note).toBe("do mais novo");
  });

  it("puts Parar o som first while a sound plays", () => {
    const playing = item("stop", "Parar o som", { kind: "stop" });
    const groups = arrange("", candidates({ playing }), labels);

    expect(groups[0]).toMatchObject({ id: "playing", title: "Tocando agora", items: [playing] });
    // It is found by name too, but only when it matches.
    expect(arrange("zzz", candidates({ playing }), labels).find((g) => g.id === "playing")).toBeUndefined();
    expect(arrange("parar", candidates({ playing }), labels)[0].id).toBe("playing");
  });

  it("lists matching sounds, prefix first, four at most, with a count and the catalogue row", () => {
    const groups = arrange("bo", candidates(), labels);

    expect(groups[0].id).toBe("sounds");
    expect(groups[0].items.map((i) => i.title)).toEqual(["Bonk", "Bom dia", "Boa noite", "Vine boom"]);
    expect(groups[0].note).toBe("4 de 6");
    expect(groups[1]).toMatchObject({ id: "explore", title: "Explorar" });
    expect(groups[1].items[0].title).toBe("Buscar “bo”");
  });

  it("carries the text as typed, not normalised, to the catalogue row", () => {
    const groups = arrange("  Bô ", candidates(), labels);

    expect(groups.find((g) => g.id === "explore")!.items[0].title).toBe("Buscar “Bô”");
  });

  it("finds a sound by its own key", () => {
    const groups = arrange("k", candidates(), labels);

    expect(groups[0].items[0].title).toBe("Bonk");
  });

  it("finds actions and settings by their keywords, and servers by name", () => {
    expect(ids(arrange("ordenar", candidates(), labels)).find(([id]) => id === "actions")).toEqual(["actions", ["organize"]]);
    expect(arrange("idioma", candidates(), labels).find((g) => g.id === "settings")!.items.map((i) => i.id)).toEqual(["lang:en", "section:general"]);
    expect(arrange("servidor", candidates(), labels).find((g) => g.id === "servers")!.items.map((i) => i.id)).toEqual(["srv:a"]);
  });

  it("orders the groups as the design fixes: sounds, explore, actions, settings, servers", () => {
    const groups = arrange("s", candidates({ playing: item("stop", "Sair", { kind: "stop" }) }), labels);

    expect(groups.map((g) => g.id)).toEqual(["playing", "sounds", "explore", "actions", "settings", "servers"]);
  });

  it("caps settings at six and servers at three", () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`x${i}`, `Sala ${i}`));
    const groups = arrange("sala", candidates({ settings: many, servers: many }), labels);

    expect(groups.find((g) => g.id === "settings")!.items).toHaveLength(6);
    expect(groups.find((g) => g.id === "servers")!.items).toHaveLength(3);
  });

  it("keeps the order actions were listed in among equal ranks", () => {
    const groups = arrange("a", candidates({ actions: [item("b", "Abrir b"), item("a", "Abrir a"), item("c", "Abrir c")] }), labels);

    expect(groups.find((g) => g.id === "actions")!.items.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("> leaves out the sounds and the catalogue row", () => {
    const groups = arrange(">idioma", candidates(), labels);

    expect(groups.map((g) => g.id)).toEqual(["settings"]);
    expect(arrange(">", candidates(), labels).map((g) => g.id)).toEqual(["actions"]);
  });

  it("has no groups when nothing matches, but the catalogue row is still an exit", () => {
    const groups = arrange("xyzzy", candidates(), labels);

    expect(groups.map((g) => g.id)).toEqual(["explore"]);
    expect(arrange("xyzzy", candidates({ explore: undefined }), labels)).toEqual([]);
  });

  it("leaves the sounds out when there are none, as in Organizar", () => {
    const groups = arrange("", candidates({ recents: [], sounds: [] }), labels);

    expect(groups.map((g) => g.id)).toEqual(["actions"]);
  });
});

describe("flatten, filterThemes and pushRecent", () => {
  it("flattens in reading order", () => {
    expect(flatten(arrange("", candidates(), labels)).map((i) => i.id)).toEqual(["s:Vine boom", "s:Airhorn", "s:Bonk", "add", "organize", "explore-tab", "settings"]);
  });

  it("filters the theme list by name and keeps all eight with nothing typed", () => {
    const themes = ["Esmalte", "Frevo", "Brasa"].map((title) => item(title, title));

    expect(filterThemes(themes, "").map((i) => i.title)).toEqual(["Esmalte", "Frevo", "Brasa"]);
    expect(filterThemes(themes, " bra ").map((i) => i.title)).toEqual(["Brasa"]);
    expect(filterThemes(themes, "zz")).toEqual([]);
  });

  it("keeps three recents, newest first, one entry per clip", () => {
    expect(pushRecent([], "a")).toEqual(["a"]);
    expect(pushRecent(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });
});
