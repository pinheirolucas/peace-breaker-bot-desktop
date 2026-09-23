import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FavoritesPanel from "./FavoritesPanel";
import SnackbarContext from "./SnackbarContext";
import { getContent, playOnDiscord, stopPlayingOnDiscord } from "./service";
import type { BotStatus } from "./service";
import type { Instant } from "./storage";

vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  getContent: vi.fn(),
  playOnDiscord: vi.fn(),
  stopPlayingOnDiscord: vi.fn()
}));

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

const seeded: Instant[] = [
  { name: "Vish", url: "https://www.myinstants.com/a/", key: "v" },
  { name: "Bruxaria", url: "https://www.myinstants.com/b/", key: "b" },
  { name: "Sem tecla", url: "https://www.myinstants.com/c/" }
];

function renderPanel({
  botStatus = null,
  organizing = false,
  active = true
}: { botStatus?: BotStatus | null; organizing?: boolean; active?: boolean } = {}) {
  localStorage.setItem("instants", JSON.stringify(seeded));
  const snackbar = { openSnackbar: vi.fn(), closeSnackbar: vi.fn() };
  const view = render(
    <SnackbarContext.Provider value={snackbar}>
      <input aria-label="campo" />
      <FavoritesPanel
        search=""
        healthy
        botStatus={botStatus}
        serverAddress="localhost:9001"
        onSwitchServer={vi.fn()}
        onSummary={vi.fn()}
        addOpen={false}
        onAddOpenChange={vi.fn()}
        onSearchCatalog={vi.fn()}
        organizing={organizing}
        onOrganizingChange={vi.fn()}
        onPlayingChange={vi.fn()}
        active={active}
      />
    </SnackbarContext.Provider>
  );
  return { ...view, snackbar };
}

describe("clip keys in Favoritos", () => {
  beforeEach(() => {
    localStorage.clear();
    FakeAudio.played = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.mocked(getContent).mockReset().mockResolvedValue({ exists: true, content: "data:audio/mp3;x" });
    vi.mocked(playOnDiscord).mockReset().mockResolvedValue("end");
    vi.mocked(stopPlayingOnDiscord).mockReset().mockResolvedValue({} as Response);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("plays the sound on Discord for a bare key", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.keyboard("v");

    await waitFor(() => expect(playOnDiscord).toHaveBeenCalledWith(seeded[0].url));
  });

  it("plays here for Shift + key", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.keyboard("{Shift>}v{/Shift}");

    await waitFor(() => expect(FakeAudio.played).toHaveLength(1));
    expect(playOnDiscord).not.toHaveBeenCalled();
  });

  it("ignores a key no sound has", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.keyboard("q");

    expect(playOnDiscord).not.toHaveBeenCalled();
  });

  it("does not fire with the focus in a text field", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("textbox", { name: "campo" }));
    await user.keyboard("v");

    expect(playOnDiscord).not.toHaveBeenCalled();
  });

  it("does not fire in Organizar", async () => {
    const user = userEvent.setup();
    renderPanel({ organizing: true });

    await user.keyboard("v");

    expect(playOnDiscord).not.toHaveBeenCalled();
  });

  it("does not fire with Cmd or Ctrl held", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.keyboard("{Meta>}v{/Meta}");
    await user.keyboard("{Control>}v{/Control}");

    expect(playOnDiscord).not.toHaveBeenCalled();
  });

  it("refuses a Discord key when the bot is confirmed out of its channel", async () => {
    const user = userEvent.setup();
    const { snackbar } = renderPanel({ botStatus: { connected: false } as BotStatus });

    await user.keyboard("v");

    expect(playOnDiscord).not.toHaveBeenCalled();
    expect(snackbar.openSnackbar).toHaveBeenCalledWith({
      message: "O bot não está em um canal de voz"
    });
  });

  it("never treats an unknown bot status as out of the channel", async () => {
    const user = userEvent.setup();
    renderPanel({ botStatus: null });

    await user.keyboard("v");

    await waitFor(() => expect(playOnDiscord).toHaveBeenCalled());
  });

  it("refuses another sound's key while one plays, and Esc stops", async () => {
    let finish: (reason: string) => void = () => undefined;
    vi.mocked(playOnDiscord).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderPanel();

    await user.keyboard("v");
    await waitFor(() => expect(playOnDiscord).toHaveBeenCalledTimes(1));

    await user.keyboard("b");
    expect(playOnDiscord).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(stopPlayingOnDiscord).toHaveBeenCalled());
    finish("stop");
  });

  it("prints the key on the card and announces it to assistive tech", () => {
    renderPanel();

    const article = screen.getByRole("article", { name: "Vish" });
    expect(within(article).getByRole("button", { name: "Vish" })).toHaveAttribute(
      "aria-keyshortcuts",
      "V Shift+V"
    );
    expect(article.querySelector(".kc")).toHaveTextContent("V");
    expect(screen.getByRole("article", { name: "Sem tecla" }).querySelector(".kc")).toBeNull();
  });

  it("shows a dashed empty keycap and the keyboard button in Organizar", () => {
    renderPanel({ organizing: true });

    const article = screen.getByRole("article", { name: "Sem tecla" });
    expect(article.querySelector(".kc[data-empty]")).not.toBeNull();
    expect(within(article).getByRole("button", { name: "Definir atalho para Sem tecla" })).toBeVisible();
  });

  it("sets a key from the dialog, and moving a taken one offers an undo", async () => {
    const user = userEvent.setup();
    const { snackbar } = renderPanel({ organizing: true });

    await user.click(screen.getByRole("button", { name: "Definir atalho para Sem tecla" }));
    const dialog = screen.getByRole("dialog", { name: "Atalho para “Sem tecla”" });

    await user.keyboard("b");
    expect(within(dialog).getByText(/B já toca “Bruxaria”/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    const stored = JSON.parse(localStorage.getItem("instants")!) as Instant[];
    expect(stored.find((item) => item.name === "Sem tecla")?.key).toBe("b");
    expect(stored.find((item) => item.name === "Bruxaria")?.key).toBeUndefined();
    expect(snackbar.openSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({ actionLabel: "Desfazer" })
    );
  });

  it("refuses Space and punctuation in the dialog", async () => {
    const user = userEvent.setup();
    renderPanel({ organizing: true });

    await user.click(screen.getByRole("button", { name: "Definir atalho para Sem tecla" }));
    await user.keyboard(" ");

    expect(screen.getByText("Não dá para usar esta tecla")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });
});
