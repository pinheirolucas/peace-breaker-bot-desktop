import { describe, it, expect, beforeEach, afterEach, onTestFinished, vi } from "vitest";
import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import FavoritesPanel from "./FavoritesPanel";
import SnackbarContext from "./SnackbarContext";
import { getContent, playOnDiscord, stopPlayingOnDiscord } from "./service";
import type { BotStatus } from "./service";

vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  getContent: vi.fn(),
  playOnDiscord: vi.fn(),
  stopPlayingOnDiscord: vi.fn()
}));

// useAudioPlayer builds a detached `new Audio()`; jsdom implements neither
// play() nor pause() and would spray "Not implemented" across every run.
class FakeAudio extends EventTarget {
  static played: string[] = [];
  src = "";
  currentTime = 0;
  play() {
    FakeAudio.played.push(this.src);
    return Promise.resolve();
  }
  pause() {}
}

// Each card is an <article> named after its clip. The body's play control
// is a button carrying the clip's name; the footer buttons carry their own.
function card(name: string) {
  return screen.getByRole("article", { name });
}
function play(name: string) {
  return within(card(name)).getByRole("button", { name });
}
function action(name: string, label: string) {
  return within(card(name)).getByRole("button", { name: label });
}

const seeded = [
  { name: "Primeiro", url: "https://www.myinstants.com/a/" },
  { name: "Segundo", url: "https://www.myinstants.com/b/" }
];

function storedInstants() {
  return JSON.parse(localStorage.getItem("instants") ?? "null");
}

// The add form opens from the tools row, which lives in App. A plain button
// stands in for it so the panel can be driven on its own.
function renderPanel({
  search = "",
  instants = seeded,
  healthy = true,
  botStatus = null,
  organizing: startOrganizing = false
}: {
  search?: string;
  instants?: typeof seeded;
  healthy?: boolean;
  botStatus?: BotStatus | null;
  organizing?: boolean;
} = {}) {
  localStorage.setItem("instants", JSON.stringify(instants));

  const snackbar = { openSnackbar: vi.fn(), closeSnackbar: vi.fn() };
  const props = {
    onSummary: vi.fn(),
    onSearchCatalog: vi.fn(),
    onSwitchServer: vi.fn(),
    onPlayingChange: vi.fn()
  };

  function Harness() {
    const [addOpen, setAddOpen] = useState(false);
    const [organizing, setOrganizing] = useState(startOrganizing);
    return (
      <SnackbarContext.Provider value={snackbar}>
        <button type="button" onClick={() => setAddOpen(true)}>
          Adicionar
        </button>
        <FavoritesPanel
          search={search}
          healthy={healthy}
          botStatus={botStatus}
          serverAddress="localhost:9001"
          addOpen={addOpen}
          onAddOpenChange={setAddOpen}
          organizing={organizing}
          onOrganizingChange={setOrganizing}
          {...props}
        />
      </SnackbarContext.Provider>
    );
  }

  const result = render(<Harness />);
  return { ...result, snackbar, ...props };
}

async function openForm(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Adicionar" }));
  return within(screen.getByRole("dialog", { name: "Adicionar instant" }));
}

function useFakeAudio() {
  beforeEach(() => {
    localStorage.clear();
    FakeAudio.played = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.mocked(getContent).mockReset();
    vi.mocked(playOnDiscord).mockReset();
    vi.mocked(stopPlayingOnDiscord).mockReset().mockResolvedValue({} as Response);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });
}

describe("FavoritesPanel", () => {
  useFakeAudio();

  it("renders a card per instant already in localStorage", () => {
    renderPanel();

    expect(card("Primeiro")).toBeInTheDocument();
    expect(card("Segundo")).toBeInTheDocument();
  });

  it("reports how many sounds are saved", () => {
    const { onSummary } = renderPanel();

    expect(onSummary).toHaveBeenLastCalledWith("2 sons salvos");
  });

  it("reports how many match while searching", () => {
    const { onSummary } = renderPanel({ search: "prim" });

    expect(onSummary).toHaveBeenLastCalledWith("1 de 2");
  });

  // First launch: the button is the only thing on screen.
  it("offers to add a first instant when nothing is stored", async () => {
    const user = userEvent.setup();
    renderPanel({ instants: [] });

    expect(screen.getByRole("heading", { name: "Sem sons ainda" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adicionar um instant" }));

    expect(screen.getByRole("dialog", { name: "Adicionar instant" })).toBeInTheDocument();
  });

  it("filters by name, case-insensitively", () => {
    renderPanel({ search: "prim" });

    expect(card("Primeiro")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Segundo" })).toBeNull();
  });

  it("carries a search that matches nothing over to the catalogue", async () => {
    const user = userEvent.setup();
    const { onSearchCatalog } = renderPanel({ search: "terceiro" });

    expect(screen.getByRole("heading", { name: "Nada por aqui" })).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum dos seus 2 favoritos bate com “terceiro”. O catálogo do MyInstants é bem maior.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Procurar “terceiro” no MyInstants" }));

    expect(onSearchCatalog).toHaveBeenCalledTimes(1);
  });

  it("removes an instant from the list and from storage", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(action("Primeiro", "Remover"));

    expect(screen.queryByRole("article", { name: "Primeiro" })).toBeNull();
    expect(card("Segundo")).toBeInTheDocument();
    expect(storedInstants()).toEqual([seeded[1]]);
  });

  it("saves a new instant through the form and persists it", async () => {
    const user = userEvent.setup();
    renderPanel();

    const dialog = await openForm(user);
    await user.type(dialog.getByLabelText("Nome"), "Terceiro");
    await user.type(dialog.getByLabelText("Link"), "https://www.myinstants.com/c/");
    await user.click(dialog.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(card("Terceiro")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(storedInstants()).toEqual([
      ...seeded,
      { name: "Terceiro", url: "https://www.myinstants.com/c/" }
    ]);
  });

  it("refuses a duplicate url and names the instant that already holds it", async () => {
    const user = userEvent.setup();
    const { snackbar } = renderPanel();

    const dialog = await openForm(user);
    await user.type(dialog.getByLabelText("Nome"), "Duplicado");
    await user.type(dialog.getByLabelText("Link"), seeded[0].url);
    await user.click(dialog.getByRole("button", { name: "Salvar" }));

    expect(snackbar.openSnackbar).toHaveBeenCalledWith({
      message: "Esse instant já está salvo como “Primeiro”"
    });
    expect(storedInstants()).toHaveLength(2);
  });

  it("keeps Salvar dead until the name has three characters and there is a link", async () => {
    const user = userEvent.setup();
    renderPanel();

    const dialog = await openForm(user);
    const save = dialog.getByRole("button", { name: "Salvar" });

    await user.type(dialog.getByLabelText("Nome"), "ab");
    expect(dialog.getByText("Mínimo 3 caracteres")).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.type(dialog.getByLabelText("Link"), "https://www.myinstants.com/c/");
    expect(save).toBeDisabled();

    await user.type(dialog.getByLabelText("Nome"), "c");
    expect(save).toBeEnabled();
    expect(dialog.queryByText("Mínimo 3 caracteres")).toBeNull();
  });

  it("plays a clip locally with the content the backend hands back", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockResolvedValue({
      exists: true,
      content: "data:audio/mp3;base64,AAAA"
    });

    renderPanel();

    await user.click(play("Primeiro"));

    await waitFor(() => {
      expect(FakeAudio.played).toEqual(["data:audio/mp3;base64,AAAA"]);
    });
    expect(getContent).toHaveBeenCalledWith(seeded[0].url);
  });

  it("offers to remove an instant the backend no longer has", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockResolvedValue({ exists: false });

    const { snackbar } = renderPanel();

    await user.click(play("Primeiro"));
    await waitFor(() => expect(snackbar.openSnackbar).toHaveBeenCalled());

    const [{ message, actionLabel, onAction }] = snackbar.openSnackbar.mock.calls[0];
    expect(message).toBe("Parece que este instant não existe mais");
    expect(actionLabel).toBe("Remover");

    act(() => onAction());

    expect(snackbar.closeSnackbar).toHaveBeenCalled();
    expect(storedInstants()).toEqual([seeded[1]]);
    await waitFor(() => expect(screen.queryByRole("article", { name: "Primeiro" })).toBeNull());
  });

  it("surfaces a Discord playback failure as a snackbar", async () => {
    const user = userEvent.setup();
    vi.mocked(playOnDiscord).mockRejectedValue(new Error("O instant enviado não foi encontrado"));

    const { snackbar } = renderPanel();

    await user.click(action("Primeiro", "Reproduzir no Discord"));

    await waitFor(() => {
      expect(snackbar.openSnackbar).toHaveBeenCalledWith(
        expect.objectContaining({ message: "O instant enviado não foi encontrado" })
      );
    });
  });

  it("locks the other playback path while Discord is busy", async () => {
    const user = userEvent.setup();
    // Never resolves: /bot/play stays open for as long as the clip runs.
    vi.mocked(playOnDiscord).mockReturnValue(new Promise(() => {}));

    renderPanel();

    await user.click(action("Primeiro", "Reproduzir no Discord"));

    await waitFor(() => expect(play("Primeiro")).toBeDisabled());
    expect(within(card("Primeiro")).getByText("No Discord")).toBeInTheDocument();
    // Every other card steps back, not just its play control.
    expect(play("Segundo")).toBeDisabled();
    expect(card("Segundo")).toHaveAttribute("data-dim", "true");
    // Only the playing card can be stopped.
    expect(action("Primeiro", "Parar")).toBeEnabled();
    expect(action("Segundo", "Parar")).toBeDisabled();
    // A playing card locks its own remove; the others keep theirs.
    expect(action("Primeiro", "Remover")).toBeDisabled();
    expect(action("Segundo", "Remover")).toBeEnabled();
  });

  it("steps the other cards back while a clip plays locally, but lets it replay", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockResolvedValue({
      exists: true,
      content: "data:audio/mp3;base64,AAAA"
    });

    renderPanel();

    await user.click(play("Primeiro"));

    await waitFor(() => expect(card("Primeiro")).toHaveAttribute("data-live", "true"));
    expect(within(card("Primeiro")).getByText("Reproduzindo")).toBeInTheDocument();
    expect(play("Primeiro")).toBeEnabled();
    expect(play("Segundo")).toBeDisabled();
    expect(action("Primeiro", "Reproduzir no Discord")).toBeDisabled();
    expect(action("Segundo", "Reproduzir no Discord")).toBeDisabled();
  });

  it("stops Discord playback through the backend", async () => {
    const user = userEvent.setup();
    vi.mocked(playOnDiscord).mockReturnValue(new Promise(() => {}));

    renderPanel();

    await user.click(action("Primeiro", "Reproduzir no Discord"));
    await waitFor(() => expect(action("Primeiro", "Parar")).toBeEnabled());

    await user.click(action("Primeiro", "Parar"));

    expect(stopPlayingOnDiscord).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(play("Primeiro")).toBeEnabled());
  });

  // Health is passive: the app only learns the server is back when a click
  // gets an answer. So offline the grid steps back visually but every button
  // stays live — disabling playback here would lock the user out.
  it("keeps playback clickable while the server is silent, with a way to switch", async () => {
    const user = userEvent.setup();
    const { onSwitchServer } = renderPanel({ healthy: false });

    expect(screen.getByRole("status")).toHaveTextContent("localhost:9001 não está respondendo");
    expect(play("Primeiro")).toBeEnabled();
    expect(action("Primeiro", "Reproduzir no Discord")).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Trocar" }));

    expect(onSwitchServer).toHaveBeenCalledTimes(1);
  });
});

describe("FavoritesPanel when a clip cannot be fetched", () => {
  useFakeAudio();

  it("shows the backend message rather than failing silently", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockRejectedValue(new Error("Nenhuma URL enviada"));

    const { snackbar } = renderPanel();

    await user.click(play("Primeiro"));

    await waitFor(() =>
      expect(snackbar.openSnackbar).toHaveBeenCalledWith({ message: "Nenhuma URL enviada" })
    );
    expect(FakeAudio.played).toEqual([]);
  });

  it("keeps the remove action for an instant that is merely gone", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockResolvedValue({ exists: false });

    const { snackbar } = renderPanel();

    await user.click(play("Primeiro"));

    await waitFor(() => expect(snackbar.openSnackbar).toHaveBeenCalled());
    const call = snackbar.openSnackbar.mock.calls[0][0];
    expect(call.message).toBe("Parece que este instant não existe mais");
    expect(typeof call.onAction).toBe("function");
  });

  it("carries the backend message out of a failed discord send", async () => {
    const user = userEvent.setup();
    vi.mocked(playOnDiscord).mockRejectedValue(new Error("O instant enviado não foi encontrado"));

    const { snackbar } = renderPanel();

    await user.click(action("Primeiro", "Reproduzir no Discord"));

    await waitFor(() => expect(snackbar.openSnackbar).toHaveBeenCalled());
    expect(snackbar.openSnackbar.mock.calls[0][0].message).toBe(
      "O instant enviado não foi encontrado"
    );
  });

  describe("Organizar", () => {
    it("turns the card body into a drag handle and swaps the footer", () => {
      renderPanel({ organizing: true });

      const first = card("Primeiro");
      expect(
        within(first).getByRole("button", { name: "Mover Primeiro, posição 1 de 2" })
      ).toBeInTheDocument();
      expect(within(first).getByRole("button", { name: "Renomear" })).toBeInTheDocument();
      expect(within(first).getByRole("button", { name: "Remover" })).toBeInTheDocument();
      expect(within(first).queryByRole("button", { name: "Reproduzir no Discord" })).toBeNull();
      expect(within(first).queryByRole("button", { name: "Parar" })).toBeNull();
    });

    it("never plays from a card while organizing", async () => {
      const user = userEvent.setup();
      renderPanel({ organizing: true });

      await user.click(
        within(card("Primeiro")).getByRole("button", { name: /^Mover Primeiro/ })
      );

      expect(getContent).not.toHaveBeenCalled();
    });

    it("reports what the count line should say", () => {
      const { onSummary } = renderPanel({ organizing: true });

      expect(onSummary).toHaveBeenLastCalledWith("Arraste para reordenar");
    });

    it("shows every favourite even when a search is set", () => {
      renderPanel({ organizing: true, search: "segundo" });

      expect(screen.getByRole("article", { name: "Primeiro" })).toBeInTheDocument();
      expect(screen.getByRole("article", { name: "Segundo" })).toBeInTheDocument();
    });

    it("renames a favourite through the dialog and keeps its link", async () => {
      const user = userEvent.setup();
      renderPanel({ organizing: true });

      await user.click(action("Primeiro", "Renomear"));
      const dialog = within(screen.getByRole("dialog", { name: "Renomear som" }));

      const save = dialog.getByRole("button", { name: "Salvar" });
      expect(save).toBeDisabled();

      const field = dialog.getByLabelText("Nome");
      expect(field).toHaveValue("Primeiro");
      await user.clear(field);
      await user.type(field, "Br");
      expect(dialog.getByText("Mínimo 3 caracteres")).toBeInTheDocument();
      expect(save).toBeDisabled();

      await user.type(field, "uxaria");
      await user.click(save);

      await waitFor(() =>
        expect(storedInstants()).toEqual([
          { name: "Bruxaria", url: "https://www.myinstants.com/a/" },
          seeded[1]
        ])
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(card("Bruxaria")).toBeInTheDocument();
    });

    it("leaves the name alone when the dialog is cancelled", async () => {
      const user = userEvent.setup();
      renderPanel({ organizing: true });

      await user.click(action("Primeiro", "Renomear"));
      await user.type(screen.getByLabelText("Nome"), " novo");
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(storedInstants()).toEqual(seeded);
    });

    it("trims the saved name", async () => {
      const user = userEvent.setup();
      renderPanel({ organizing: true });

      await user.click(action("Segundo", "Renomear"));
      const field = screen.getByLabelText("Nome");
      await user.clear(field);
      await user.type(field, "  Terceiro  {Enter}");

      await waitFor(() => expect(storedInstants()[1].name).toBe("Terceiro"));
    });

    it("reorders from the keyboard and saves the new order", async () => {
      // jsdom has no layout, and dnd-kit moves a lifted card to whichever
      // slot the arrow key points at by measuring them. Lay the cards out in
      // a row so "right" has somewhere to go.
      const rects = vi.spyOn(Element.prototype, "getBoundingClientRect");
      onTestFinished(() => rects.mockRestore());
      rects.mockImplementation(function (
        this: Element
      ) {
        const cards = Array.from(document.querySelectorAll("article"));
        const index = cards.indexOf(this.closest("article") as HTMLElement);
        const left = index < 0 ? 0 : index * 300;
        const width = index < 0 ? 0 : 280;
        const height = index < 0 ? 0 : 156;
        return {
          x: left, y: 0, left, top: 0, width, height, right: left + width, bottom: height,
          toJSON: () => ({})
        } as DOMRect;
      });

      const user = userEvent.setup();
      renderPanel({ organizing: true });

      const handle = within(card("Primeiro")).getByRole("button", { name: /^Mover Primeiro/ });
      handle.focus();
      await user.keyboard(" ");
      await user.keyboard("{ArrowRight}");
      await user.keyboard(" ");

      await waitFor(() => expect(storedInstants()).toEqual([seeded[1], seeded[0]]));
    });

    it("leaves the mode on Escape when nothing is lifted", async () => {
      const user = userEvent.setup();
      renderPanel({ organizing: true });

      await user.keyboard("{Escape}");

      // Back to play mode: the body plays again and send-to-Discord is back.
      expect(within(card("Primeiro")).getByRole("button", { name: "Reproduzir no Discord" }))
        .toBeInTheDocument();
    });

    it("tells the tools row whether a clip is playing", async () => {
      const user = userEvent.setup();
      vi.mocked(getContent).mockResolvedValue({ exists: true, content: "data:audio/mp3;base64,AA" });

      const { onPlayingChange } = renderPanel();
      expect(onPlayingChange).toHaveBeenLastCalledWith(false);

      await user.click(play("Primeiro"));

      await waitFor(() => expect(onPlayingChange).toHaveBeenLastCalledWith(true));
    });
  });
});
