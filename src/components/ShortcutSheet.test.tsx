import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShortcutSheet from "./ShortcutSheet";
import type { Instant } from "../storage";

const instants: Instant[] = [
  { name: "Vish", url: "u1", key: "v" },
  { name: "Tá chegando", url: "u2", key: "1" },
  { name: "Bruxaria", url: "u3", key: "b" },
  { name: "Sem tecla", url: "u4" }
];

function installBridge() {
  window.instantsShortcuts = {
    modifiers: ["ctrl-alt-shift", "ctrl-shift", "super-alt"],
    setGlobal: vi.fn().mockResolvedValue({ registered: [], failed: [] }),
    onFired: () => () => undefined
  };
}

function installMenuBridge() {
  window.instantsMenu = {
    setState: vi.fn(),
    onCommand: () => () => undefined,
    cardContext: vi.fn(),
    gridContext: vi.fn(),
    serverContext: vi.fn(),
    serverRowContext: vi.fn(),
    selectionContext: vi.fn()
  };
}

function renderSheet(props: Partial<React.ComponentProps<typeof ShortcutSheet>> = {}) {
  const onOrganize = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ShortcutSheet
      open
      onOpenChange={onOpenChange}
      instants={instants}
      os="win"
      status={{ registered: [], failed: [] }}
      onOrganize={onOrganize}
      {...props}
    />
  );
  return { onOrganize, onOpenChange };
}

describe("ShortcutSheet", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    delete window.instantsShortcuts;
    delete window.instantsMenu;
    localStorage.clear();
  });

  it("lists keyed sounds with digits first, and counts the ones without a key", () => {
    renderSheet();

    const section = within(screen.getByRole("region", { name: "Seus sons · no Discord" }));
    expect(section.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1Tá chegando",
      "BBruxaria",
      "VVish"
    ]);
    expect(section.getByText("3 com tecla · 1 sem")).toBeInTheDocument();
  });

  it("draws the legend as three keycaps in place of the Shift sentence", () => {
    renderSheet();

    const legend = within(screen.getByRole("list", { name: "Legenda" }));
    expect(legend.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Atoca no Discord",
      "ShiftAtoca só aqui",
      "Escpara"
    ]);
    expect(screen.queryByText("Shift + tecla toca só aqui.")).toBeNull();
  });

  it("says what a key is for when no sound has one, and drops the legend", () => {
    renderSheet({ instants: [{ name: "Sem tecla", url: "u4" }] });

    expect(screen.getByText("nenhum com tecla")).toBeInTheDocument();
    expect(screen.getByText(/Dê uma tecla aos sons/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Legenda" })).toBeNull();
    expect(screen.getByRole("button", { name: "Definir em Organizar" })).toBeInTheDocument();
  });

  it("groups the window's keys, with modifiers as separate keycaps", () => {
    renderSheet();

    const app = within(screen.getByRole("region", { name: "No app" }));
    expect(app.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Tocar",
      "Navegar",
      "Adicionar",
      "O app"
    ]);
    const favorites = app.getByText("Favoritos").closest("li")!;
    expect([...favorites.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["Ctrl", "1"]);
  });

  it("names each command's menu, and lists menu-only keys, only with the menu bar", () => {
    const { unmount } = render(
      <ShortcutSheet open onOpenChange={vi.fn()} instants={instants} os="win" status={{ registered: [], failed: [] }} onOrganize={vi.fn()} />
    );
    expect(screen.queryByText("Visualizar")).toBeNull();
    expect(screen.queryByText("Recarregar a listagem")).toBeNull();
    expect(screen.queryByText("Abrir Configurações")).toBeNull();
    unmount();

    installMenuBridge();
    renderSheet();

    const reload = screen.getByText("Recarregar a listagem").closest("li")!;
    expect(within(reload).getByText("Visualizar")).toBeInTheDocument();
    expect(within(screen.getByText("Abrir Configurações").closest("li")!).getByText("Arquivo")).toBeInTheDocument();
  });

  it("names the app menu for Configurações on macOS", () => {
    installMenuBridge();
    renderSheet({ os: "mac" });

    expect(within(screen.getByText("Abrir Configurações").closest("li")!).getByText("Peace Breaker Bot")).toBeInTheDocument();
  });

  it("filters sounds and commands together, and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderSheet();

    const field = screen.getByRole("textbox", { name: "Filtrar atalhos" });
    await user.type(field, "bru");
    const sounds = within(screen.getByRole("region", { name: "Seus sons · no Discord" }));
    expect(sounds.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["BBruxaria"]);
    expect(screen.queryByRole("region", { name: "No app" })).toBeNull();

    await user.clear(field);
    await user.type(field, "explorar");
    expect(screen.getByText("Explorar")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Seus sons · no Discord" })).toBeNull();

    await user.clear(field);
    await user.type(field, "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Nenhum atalho com “zzz”");
  });

  it("starts on the filter, and / returns to it from elsewhere in the sheet", async () => {
    const user = userEvent.setup();
    renderSheet();

    const field = screen.getByRole("textbox", { name: "Filtrar atalhos" });
    expect(field).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Definir em Organizar" }).closest("section")!);
    (screen.getByRole("button", { name: "Fechar" }) as HTMLElement).focus();
    await user.keyboard("/");

    expect(field).toHaveFocus();
    expect(field).toHaveValue("");
  });

  it("has no global section without the Electron bridge", () => {
    renderSheet();

    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows each sound's combo when global keys are on, and has no switch of its own to turn them on", async () => {
    installBridge();
    localStorage.setItem("globalShortcuts", JSON.stringify({ enabled: true, modifier: null }));
    renderSheet();

    // The switch and the combination moved to Configurações › Atalhos.
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();

    const combo = await screen.findByLabelText("Ctrl+Alt+Shift+V");
    expect([...combo.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual([
      "Ctrl",
      "Alt",
      "Shift",
      "V"
    ]);
  });

  it("points to where the global keys are set, and closes itself on the way", async () => {
    installBridge();
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    const { onOpenChange } = renderSheet({ onOpenSettings });

    await user.click(screen.getByRole("button", { name: "Atalhos globais em Configurações…" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("leaves that pointer out where global keys cannot exist", () => {
    renderSheet({ onOpenSettings: vi.fn() });

    expect(screen.queryByRole("button", { name: "Atalhos globais em Configurações…" })).toBeNull();
  });

  it("marks a combo another app holds as in use", () => {
    installBridge();
    localStorage.setItem("globalShortcuts", JSON.stringify({ enabled: true, modifier: null }));
    renderSheet({ status: { registered: ["v"], failed: [{ key: "b", reason: "in-use" }] } });

    expect(screen.getAllByText(/Em uso/)).toHaveLength(2);
  });

  it("says the desktop can't do it when registration is unsupported", () => {
    installBridge();
    localStorage.setItem("globalShortcuts", JSON.stringify({ enabled: true, modifier: null }));
    renderSheet({ status: { registered: [], failed: [{ key: "v", reason: "unsupported" }] } });

    expect(screen.getByText("Seu ambiente não permite atalhos fora do app")).toBeInTheDocument();
  });

  it("closes itself before entering Organizar", async () => {
    const user = userEvent.setup();
    const { onOrganize, onOpenChange } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Definir em Organizar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOrganize).toHaveBeenCalled();
  });
});
