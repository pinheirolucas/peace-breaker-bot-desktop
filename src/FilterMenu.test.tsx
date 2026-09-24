import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterMenu, { FilterMenuItems } from "./FilterMenu";
import type { FilterMenuProps } from "./FilterMenu";
import { Menu } from "./components/Menu";
import i18n from "./i18n";
import type { ProviderInfo } from "./service";

const providers: ProviderInfo[] = [
  { key: "myinstants", name: "MyInstants", supportsSearch: true, supportsRegion: true },
  { key: "instantsmeme", name: "Instants.meme", supportsSearch: true, supportsRegion: false }
];

function props(patch: Partial<FilterMenuProps> = {}): FilterMenuProps {
  return {
    providers,
    provider: providers[0],
    onProvider: vi.fn(),
    regionSupported: true,
    region: "br",
    onRegion: vi.fn(),
    ...patch
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

afterEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("FilterMenu footer", () => {
  it("ends with a way into Configurações › Explorar, after the reset row when there is one", async () => {
    const onOpenSettings = vi.fn();
    render(<FilterMenu {...props({ provider: providers[1], regionSupported: false, onOpenSettings })} />);

    await userEvent.click(screen.getByRole("button", { name: "Filtrar por site e região" }));

    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items.slice(-2)).toEqual(["Restaurar padrão", "Mais em Configurações…"]);

    await userEvent.click(screen.getByRole("menuitem", { name: "Mais em Configurações…" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("is there at the defaults too, where there is nothing to restore", async () => {
    render(<FilterMenu {...props({ onOpenSettings: vi.fn() })} />);

    await userEvent.click(screen.getByRole("button", { name: "Filtrar por site e região" }));

    expect(screen.queryByRole("menuitem", { name: "Restaurar padrão" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Mais em Configurações…" })).toBeInTheDocument();
  });

  it("is left out where nothing can open Configurações", async () => {
    render(<FilterMenu {...props()} />);

    await userEvent.click(screen.getByRole("button", { name: "Filtrar por site e região" }));

    expect(screen.queryByRole("menuitem", { name: "Mais em Configurações…" })).toBeNull();
  });

  it("comes with the items on their own, which is what the Windows Tight overflow menu carries", async () => {
    const onOpenSettings = vi.fn();
    render(
      <Menu trigger={<button type="button">Mais</button>}>
        <FilterMenuItems {...props({ onOpenSettings })} />
      </Menu>
    );

    await userEvent.click(screen.getByRole("button", { name: "Mais" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Mais em Configurações…" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("says it in English", async () => {
    await i18n.changeLanguage("en-US");
    render(<FilterMenu {...props({ onOpenSettings: vi.fn() })} />);

    await userEvent.click(screen.getByRole("button", { name: "Filter by site and region" }));

    expect(screen.getByRole("menuitem", { name: "More in Settings…" })).toBeInTheDocument();
  });
});
