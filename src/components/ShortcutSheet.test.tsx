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
    expect(section.getByText(/1 som sem tecla/)).toBeInTheDocument();
  });

  it("has no global section without the Electron bridge", () => {
    renderSheet();

    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("turns global keys on and shows each sound's combo", async () => {
    installBridge();
    const user = userEvent.setup();
    renderSheet();

    const toggle = screen.getByRole("switch", { name: "Funcionar fora do app" });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText("Ctrl+Alt+Shift+V")).toBeNull();

    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(JSON.parse(localStorage.getItem("globalShortcuts")!).enabled).toBe(true);
    expect(await screen.findByText("Ctrl+Alt+Shift+V")).toBeInTheDocument();
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
