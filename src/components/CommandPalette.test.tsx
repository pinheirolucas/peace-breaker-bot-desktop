import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import type { PaletteCandidates, PaletteItem } from "../lib/palette";
import CommandPalette from "./CommandPalette";
import type { CommandPaletteProps } from "./CommandPalette";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

const item = (id: string, title: string, patch: Partial<PaletteItem> = {}): PaletteItem => ({ id, kind: "action", title, run: vi.fn(), ...patch });

function setup(patch: Partial<CommandPaletteProps> = {}, extra: Partial<PaletteCandidates> = {}) {
  const sounds = [
    item("s1", "Vine boom", { kind: "sound", glyph: "v", slot: "p0" }),
    item("s2", "Bonk", { kind: "sound", glyph: "k", slot: "p1" }),
    item("s3", "Bom dia", { kind: "sound", slot: "p2" })
  ];
  const candidates: PaletteCandidates = {
    recents: sounds,
    sounds,
    explore: (query) => item("explore", `Buscar “${query}” em MyInstants`, { kind: "explore" }),
    actions: [item("add", "Adicionar um som", { keys: ["Ctrl", "N"] }), item("tab", "Ir para Explorar")],
    defaultActions: 4,
    settings: [
      item("section:server", "Configurações › Servidor"),
      item("palette", "Paleta", { kind: "drill", keywords: "tema cores" }),
      item("mode:dark", "Modo: Escuro", { kind: "setting", preview: { mode: "dark" }, keywords: "escuro" }),
      item("mode:light", "Modo: Claro", { kind: "setting", preview: { mode: "light" }, keywords: "claro", current: true })
    ],
    servers: [],
    ...extra
  };
  const themes = ["esmalte", "frevo", "brasa"].map((id, index) =>
    item(`theme:${id}`, id, { kind: "setting", swatch: id as never, preview: { theme: id as never }, current: index === 0 })
  );
  const props = {
    onOpenChange: vi.fn(),
    onPreview: vi.fn(),
    status: { tone: "ok" as const, text: "Bot em #geral" },
    candidates,
    themes,
    ...patch
  };

  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <CommandPalette
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          props.onOpenChange(next);
        }}
        candidates={props.candidates}
        themes={props.themes}
        onPreview={props.onPreview}
        status={props.status}
        initialQuery={patch.initialQuery}
        initialView={patch.initialView}
      />
    );
  }

  render(<Harness />);
  return { props, sounds, themes };
}

const field = () => screen.getByRole("combobox", { name: "Buscar sons e ações" });
const selected = () => screen.getByRole("option", { selected: true });

describe("CommandPalette", () => {
  it("is a modal dialog with the field focused, and Recentes and Ações when empty", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Paleta de comandos" })).toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(within(screen.getByRole("group", { name: "Recentes" })).getAllByRole("option")).toHaveLength(3);
    expect(within(screen.getByRole("group", { name: "Ações" })).getByRole("option", { name: /Adicionar um som/ })).toBeInTheDocument();
    expect(screen.getByText("Bot em #geral")).toBeInTheDocument();
  });

  it("selects the first row and walks the rows with the arrows, wrapping", async () => {
    const user = userEvent.setup();
    setup();

    expect(selected()).toHaveTextContent("Vine boom");
    await user.keyboard("{ArrowDown}");
    expect(selected()).toHaveTextContent("Bonk");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(selected()).toHaveTextContent("Ir para Explorar");
    expect(field()).toHaveAttribute("aria-activedescendant", selected().id);
  });

  it("filters as it is typed and says so when nothing matches", async () => {
    const user = userEvent.setup();
    setup({}, { explore: undefined });

    await user.type(field(), "bo");
    expect(within(screen.getByRole("group", { name: "Sons" })).getAllByRole("option")).toHaveLength(3);

    await user.clear(field());
    await user.type(field(), "xyzzy");
    expect(screen.getByText("Nada para “xyzzy”")).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("closes first, then runs: Enter is the primary and Shift+Enter the secondary", async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const run = vi.fn((secondary: boolean) => order.push(`run:${secondary}`));
    const { props } = setup({ onOpenChange: vi.fn((open: boolean) => order.push(`open:${open}`)) }, {
      recents: [item("s1", "Vine boom", { kind: "sound", run })]
    });

    await user.keyboard("{Enter}");
    expect(order).toEqual(["open:false", "run:false"]);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("runs the secondary on Shift+Enter", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    setup({}, { recents: [item("s1", "Vine boom", { kind: "sound", run })] });

    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(run).toHaveBeenCalledWith(true);
  });

  it("runs a row on a click", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    setup({}, { actions: [item("add", "Adicionar um som", { run })] });

    await user.click(screen.getByRole("option", { name: /Adicionar um som/ }));

    expect(run).toHaveBeenCalledWith(false);
  });

  it("follows the pointer with the selection", async () => {
    const user = userEvent.setup();
    setup();

    await user.hover(screen.getByRole("option", { name: /Ir para Explorar/ }));

    expect(selected()).toHaveTextContent("Ir para Explorar");
  });

  it("refuses a sound the bot cannot take, says why, and stays open; Shift+Enter still plays it", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const { props } = setup({}, {
      recents: [item("s1", "Vine boom", { kind: "sound", refused: true, dim: true, tag: "só aqui", tagTone: "warn", run })]
    });

    await user.keyboard("{Enter}");
    expect(run).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("O bot não está em um canal. ⇧ Enter toca só aqui.")).toBeInTheDocument();
    expect(screen.getByText("só aqui")).toBeInTheDocument();

    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(run).toHaveBeenCalledWith(true);
  });

  it("shows only the hints that hold for the selected row", async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.getByText("tocar no Discord")).toBeInTheDocument();
    expect(screen.getByText("tocar aqui")).toBeInTheDocument();

    await user.keyboard("{ArrowUp}");
    expect(screen.queryByText("tocar no Discord")).toBeNull();
    expect(screen.getByText("executar")).toBeInTheDocument();
  });

  describe("Esc", () => {
    it("clears the text first, and closes only when there is none", async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await user.type(field(), "bo");
      await user.keyboard("{Escape}");
      expect(field()).toHaveValue("");
      expect(props.onOpenChange).not.toHaveBeenCalled();

      await user.keyboard("{Escape}");
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("the live preview", () => {
    it("previews a colour mode as its row is highlighted, and drops it on the way out", async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await user.type(field(), ">modo");
      expect(props.onPreview).toHaveBeenLastCalledWith({ mode: "dark" });

      await user.keyboard("{ArrowDown}");
      expect(props.onPreview).toHaveBeenLastCalledWith({ mode: "light" });

      await user.keyboard("{Escape}{Escape}");
      expect(props.onPreview).toHaveBeenLastCalledWith(null);
    });

    it("drops the preview when the highlight moves to a row with nothing to preview", async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await user.type(field(), ">escuro");
      expect(props.onPreview).toHaveBeenLastCalledWith({ mode: "dark" });

      await user.clear(field());
      expect(props.onPreview).toHaveBeenLastCalledWith(null);
    });

    it("saves nothing itself: Enter hands the choice to the row's own handler, without dropping it after", async () => {
      const user = userEvent.setup();
      const run = vi.fn();
      const { props } = setup({}, { settings: [item("mode:dark", "Modo: Escuro", { kind: "setting", preview: { mode: "dark" }, run })] });

      await user.type(field(), ">modo");
      await user.keyboard("{Enter}");

      expect(run).toHaveBeenCalledTimes(1);
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
      // The commit was the row's; a cancel after it would be a second, wrong, answer.
      expect(props.onPreview).not.toHaveBeenLastCalledWith(null);
    });

    it("drops it on any other way out: the shortcut's own close, a click outside", async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await user.type(field(), ">modo");
      expect(props.onPreview).toHaveBeenLastCalledWith({ mode: "dark" });

      // A click on the scrim closes it.
      await user.click(document.querySelector(".pscrim")!);
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
      expect(props.onPreview).toHaveBeenLastCalledWith(null);
    });
  });

  describe("Paleta", () => {
    async function openThemes(user: ReturnType<typeof userEvent.setup>) {
      await user.type(field(), ">paleta");
      await user.keyboard("{Enter}");
    }

    it("opens the eight as a list under a breadcrumb, on the palette in use, and previews it", async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await openThemes(user);

      expect(screen.getByText("Paleta", { selector: ".crumb" })).toBeInTheDocument();
      expect(screen.getByText(/Prévia ao vivo/)).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(3);
      expect(selected()).toHaveTextContent("esmalte");
      expect(within(selected()).getByText("atual")).toBeInTheDocument();
      expect(props.onPreview).toHaveBeenLastCalledWith({ theme: "esmalte" });
      expect(props.onOpenChange).not.toHaveBeenCalled();
    });

    it("previews each row the arrows reach, and Enter saves the one it is on", async () => {
      const user = userEvent.setup();
      const { props, themes } = setup();
      await openThemes(user);

      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(props.onPreview).toHaveBeenLastCalledWith({ theme: "brasa" });

      await user.keyboard("{Enter}");
      expect(themes[2].run).toHaveBeenCalledTimes(1);
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });

    it("goes back on Esc, dropping the preview, and does not close", async () => {
      const user = userEvent.setup();
      const { props } = setup();
      await openThemes(user);
      await user.keyboard("{ArrowDown}");

      await user.keyboard("{Escape}");

      expect(props.onPreview).toHaveBeenLastCalledWith(null);
      expect(screen.queryByText("Paleta", { selector: ".crumb" })).toBeNull();
      expect(screen.getByRole("group", { name: "Recentes" })).toBeInTheDocument();
      expect(props.onOpenChange).not.toHaveBeenCalled();
    });

    it("goes back on Backspace in an empty field, and only then", async () => {
      const user = userEvent.setup();
      setup();
      await openThemes(user);

      await user.type(field(), "fre");
      expect(screen.getAllByRole("option")).toHaveLength(1);
      await user.keyboard("{Backspace}{Backspace}{Backspace}");
      expect(screen.getByText("Paleta", { selector: ".crumb" })).toBeInTheDocument();

      await user.keyboard("{Backspace}");
      expect(screen.queryByText("Paleta", { selector: ".crumb" })).toBeNull();
    });

    it("can start inside the list, for a story", () => {
      setup({ initialView: "themes" });

      expect(screen.getByText("Paleta", { selector: ".crumb" })).toBeInTheDocument();
    });
  });

  it("says it in English", async () => {
    await i18n.changeLanguage("en-US");
    setup();

    expect(screen.getByRole("combobox", { name: "Search sounds and actions" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Recent" })).toBeInTheDocument();
  });

  it("picks the matched part of a title out, ignoring accents", async () => {
    const user = userEvent.setup();
    setup();

    await user.type(field(), "configuracoes");
    expect(screen.getByText("Configurações", { selector: "b.h" })).toBeInTheDocument();

    await user.clear(field());
    await user.type(field(), "bonk");
    expect(screen.getByText("Bonk", { selector: "b.h" })).toBeInTheDocument();
  });

  it("does not use the quick-access row class, whose border and padding would bleed in", () => {
    setup();

    for (const row of screen.getAllByRole("option")) expect(row).not.toHaveClass("prow");
  });
});
