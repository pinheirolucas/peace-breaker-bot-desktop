import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MyInstantsPanel from "./MyInstantsPanel";
import type { ActiveProvider } from "./MyInstantsPanel";
import SnackbarContext from "./SnackbarContext";
import { getContent, getInstants, playOnDiscord, stopPlayingOnDiscord } from "./service";
import type { Region } from "./regions";
import type { BotStatus, Listing } from "./service";
import type { Instant } from "./storage";

vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  getContent: vi.fn(),
  getInstants: vi.fn(),
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

function card(name: string) {
  return screen.getByRole("article", { name });
}
function play(name: string) {
  return within(card(name)).getByRole("button", { name });
}
function action(name: string, label: string) {
  return within(card(name)).getByRole("button", { name: label });
}

function storedInstants() {
  const raw = localStorage.getItem("instants");
  return raw === null ? null : JSON.parse(raw);
}

// The backend's contract says a listing always arrives. Two tests break it
// on purpose, because a missing one used to unmount the tree to a blank window.
const noListing = undefined as unknown as Listing;

const page1 = {
  instants: [
    { name: "Primeiro", url: "https://www.myinstants.com/a/" },
    { name: "Segundo", url: "https://www.myinstants.com/b/" }
  ],
  pages: 3
};

const page2 = {
  instants: [{ name: "Terceiro", url: "https://www.myinstants.com/c/" }],
  pages: 3
};

function renderPanel({
  search = "",
  region = "br",
  provider = undefined,
  favorites = [],
  healthy = true,
  botStatus = null
}: {
  search?: string;
  region?: Region;
  provider?: ActiveProvider;
  favorites?: Instant[];
  healthy?: boolean;
  botStatus?: BotStatus | null;
} = {}) {
  localStorage.setItem("instants", JSON.stringify(favorites));

  const snackbar = { openSnackbar: vi.fn(), closeSnackbar: vi.fn() };
  const props = { onSummary: vi.fn(), onClearSearch: vi.fn(), onSwitchServer: vi.fn() };

  const ui = (next: { search: string; region: Region; provider?: ActiveProvider }) => (
    <SnackbarContext.Provider value={snackbar}>
      <MyInstantsPanel
        search={next.search}
        region={next.region}
        provider={next.provider}
        healthy={healthy}
        botStatus={botStatus}
        serverAddress="localhost:9001"
        {...props}
      />
    </SnackbarContext.Provider>
  );

  // Tracked so changing one of the three keeps the others.
  let current = { search, region, provider };
  const result = render(ui(current));
  const rerenderWith = (next: Partial<typeof current>) => {
    current = { ...current, ...next };
    result.rerender(ui(current));
  };

  return {
    ...result,
    snackbar,
    ...props,
    rerenderWithSearch: (nextSearch: string) => rerenderWith({ search: nextSearch }),
    rerenderWithRegion: (nextRegion: Region) => rerenderWith({ region: nextRegion }),
    rerenderWithProvider: (nextProvider: ActiveProvider) => rerenderWith({ provider: nextProvider })
  };
}

function useFakes(listing: Listing | null = page1) {
  beforeEach(() => {
    localStorage.clear();
    FakeAudio.played = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.mocked(getContent).mockReset();
    vi.mocked(getInstants).mockReset();
    if (listing) vi.mocked(getInstants).mockResolvedValue(listing);
    vi.mocked(playOnDiscord).mockReset();
    vi.mocked(stopPlayingOnDiscord).mockReset().mockResolvedValue({} as Response);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });
}

describe("MyInstantsPanel", () => {
  useFakes();

  it("loads the first page on mount and renders a card per result", async () => {
    renderPanel();

    expect(await screen.findByRole("article", { name: "Primeiro" })).toBeInTheDocument();
    expect(card("Segundo")).toBeInTheDocument();
    expect(getInstants).toHaveBeenCalledWith(1, "", "br");
  });

  // The listing scrapes myinstants.com server-side and is slow; the skeleton
  // has the card's exact footprint so nothing jumps when it lands.
  it("shows card-shaped skeletons while the first page is in flight", () => {
    vi.mocked(getInstants).mockReturnValue(new Promise(() => {}));
    const { container, onSummary } = renderPanel();

    expect(container.querySelectorAll(".skel")).toHaveLength(8);
    expect(screen.queryByRole("article")).toBeNull();
    expect(onSummary).toHaveBeenLastCalledWith("carregando…");
  });

  it("reports how many results are on screen", async () => {
    const { onSummary } = renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    // onSummary fires from its own effect, a tick after the cards commit —
    // asserting right after findByRole resolves is a race, flaky exactly
    // the way every other mock assertion in this file already avoids by
    // waiting for the call itself instead of a DOM proxy for it.
    await waitFor(() => expect(onSummary).toHaveBeenLastCalledWith("2 resultados"));
  });

  it("refetches when the search term changes, replacing the list", async () => {
    const { rerenderWithSearch } = renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    vi.mocked(getInstants).mockResolvedValue(page2);
    rerenderWithSearch("terceiro");

    expect(await screen.findByRole("article", { name: "Terceiro" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Primeiro" })).toBeNull();
    expect(getInstants).toHaveBeenLastCalledWith(1, "terceiro", "br");
  });

  // Used to be asserted as a known bug: the page count was only ever learned
  // after a search, so opening the tab offered no way to reach page 2.
  it("offers to load more on the very first load when the backend has more pages", async () => {
    renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeInTheDocument();
  });

  it("appends the next page and keeps what is already on screen", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    vi.mocked(getInstants).mockResolvedValue(page2);
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(await screen.findByRole("article", { name: "Terceiro" })).toBeInTheDocument();
    expect(card("Primeiro")).toBeInTheDocument();
    expect(getInstants).toHaveBeenLastCalledWith(2, "", "br");
  });

  it("drops duplicates when a page repeats an instant", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    vi.mocked(getInstants).mockResolvedValue({
      instants: [page1.instants[0], page2.instants[0]],
      pages: 3
    });
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));

    await screen.findByRole("article", { name: "Terceiro" });
    expect(screen.getAllByRole("article", { name: "Primeiro" })).toHaveLength(1);
  });

  it("hides the load-more button on the last page", async () => {
    vi.mocked(getInstants).mockResolvedValue({ ...page1, pages: 1 });
    renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  // Also a bug before: the page number survived a new search, so after
  // paging, typing fetched page 2 of the *new* query.
  it("starts a new search from page 1 even after paging", async () => {
    const user = userEvent.setup();
    const { rerenderWithSearch } = renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    vi.mocked(getInstants).mockResolvedValue(page2);
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    await screen.findByRole("article", { name: "Terceiro" });

    rerenderWithSearch("boo");

    await waitFor(() => expect(getInstants).toHaveBeenLastCalledWith(1, "boo", "br"));
  });

  it("refetches a new region from page 1 even after paging, replacing the list", async () => {
    const user = userEvent.setup();
    const { rerenderWithRegion } = renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    vi.mocked(getInstants).mockResolvedValue(page2);
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    await screen.findByRole("article", { name: "Terceiro" });

    vi.mocked(getInstants).mockResolvedValue({
      instants: [{ name: "Quarto", url: "https://www.myinstants.com/d/" }],
      pages: 2
    });
    rerenderWithRegion("pt");

    expect(await screen.findByRole("article", { name: "Quarto" })).toBeInTheDocument();
    expect(getInstants).toHaveBeenLastCalledWith(1, "", "pt");
    expect(screen.queryByRole("article", { name: "Primeiro" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Terceiro" })).toBeNull();
  });

  it("keeps the search when only the region changes", async () => {
    const { rerenderWithRegion } = renderPanel({ search: "vine" });
    await screen.findByRole("article", { name: "Primeiro" });

    rerenderWithRegion("us");

    await waitFor(() => expect(getInstants).toHaveBeenLastCalledWith(1, "vine", "us"));
  });

  it("does not refetch when rerendered with the same region", async () => {
    const { rerenderWithRegion } = renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    rerenderWithRegion("br");

    expect(getInstants).toHaveBeenCalledTimes(1);
  });

  it("favourites an instant, and says so", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    expect(action("Primeiro", "Favoritar")).toHaveAttribute("aria-pressed", "false");
    await user.click(action("Primeiro", "Favoritar"));

    expect(storedInstants()).toEqual([page1.instants[0]]);
    expect(action("Primeiro", "Favoritar")).toHaveAttribute("aria-pressed", "true");
  });

  // The old star kept the tooltip "Adicionar aos favoritos" even when a click
  // would remove it; only the icon changed, which a screen reader never
  // conveys. It is a toggle now, and its pressed state is announced.
  it("unfavourites it again on a second click", async () => {
    const user = userEvent.setup();
    renderPanel({ favorites: [page1.instants[0]] });
    await screen.findByRole("article", { name: "Primeiro" });

    expect(action("Primeiro", "Favoritar")).toHaveAttribute("aria-pressed", "true");
    await user.click(action("Primeiro", "Favoritar"));

    expect(storedInstants()).toEqual([]);
    expect(action("Primeiro", "Favoritar")).toHaveAttribute("aria-pressed", "false");
  });

  it("plays a clip locally with the content the backend hands back", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockResolvedValue({
      exists: true,
      content: "data:audio/mp3;base64,AAAA"
    });

    renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    await user.click(play("Primeiro"));

    await waitFor(() => expect(FakeAudio.played).toEqual(["data:audio/mp3;base64,AAAA"]));
  });

  it("warns when the instant no longer exists, with no remove action", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockResolvedValue({ exists: false });

    const { snackbar } = renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    await user.click(play("Primeiro"));

    await waitFor(() => {
      // Unlike Favoritos there is nothing to remove here.
      expect(snackbar.openSnackbar).toHaveBeenCalledWith({
        message: "Parece que este instant não existe mais"
      });
    });
  });

  it("shows the listing error and offers to try again", async () => {
    const user = userEvent.setup();
    vi.mocked(getInstants).mockRejectedValueOnce(new Error("A página enviada é inválida"));

    const { snackbar } = renderPanel();

    await waitFor(() =>
      expect(snackbar.openSnackbar).toHaveBeenCalledWith({ message: "A página enviada é inválida" })
    );
    expect(screen.getByRole("heading", { name: "O catálogo não carregou" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tente novamente" }));

    expect(await screen.findByRole("article", { name: "Primeiro" })).toBeInTheDocument();
    expect(getInstants).toHaveBeenCalledTimes(2);
  });

  it("offers to clear a search the catalogue has nothing for", async () => {
    const user = userEvent.setup();
    vi.mocked(getInstants).mockResolvedValue({ instants: [], pages: 1 });

    const { onClearSearch } = renderPanel({ search: "xuxa" });

    expect(await screen.findByRole("heading", { name: "Nada por aqui" })).toBeInTheDocument();
    expect(screen.getByText("Nenhum som do MyInstants bate com “xuxa”.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpar busca" }));

    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it("names the silent server above the results", async () => {
    renderPanel({ healthy: false });
    await screen.findByRole("article", { name: "Primeiro" });

    expect(screen.getByRole("status")).toHaveTextContent("localhost:9001 não está respondendo");
    expect(play("Primeiro")).toBeEnabled();
  });
});

describe("MyInstantsPanel with a resolved provider", () => {
  useFakes();

  const soundButtons: ActiveProvider = { key: "soundbuttons", name: "Sound Buttons" };

  it("sends the provider key alongside page, search and region", async () => {
    renderPanel({ provider: soundButtons });

    await waitFor(() => expect(getInstants).toHaveBeenCalledWith(1, "", "br", "soundbuttons"));
  });

  it("omits the provider entirely when none is given, exactly as before this feature", async () => {
    renderPanel();

    await waitFor(() => expect(getInstants).toHaveBeenCalledWith(1, "", "br"));
  });

  it("restarts from page 1 when only the provider changes", async () => {
    const user = userEvent.setup();
    const { rerenderWithProvider } = renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    vi.mocked(getInstants).mockResolvedValue(page2);
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    await screen.findByRole("article", { name: "Terceiro" });

    vi.mocked(getInstants).mockResolvedValue({
      instants: [{ name: "Quarto", url: "https://cdn.soundbuttons.io/d.mp3" }],
      pages: 2
    });
    rerenderWithProvider(soundButtons);

    expect(await screen.findByRole("article", { name: "Quarto" })).toBeInTheDocument();
    expect(getInstants).toHaveBeenLastCalledWith(1, "", "br", "soundbuttons");
    expect(screen.queryByRole("article", { name: "Primeiro" })).toBeNull();
  });

  it("names the active provider in the empty-catalogue message", async () => {
    vi.mocked(getInstants).mockResolvedValue({ instants: [], pages: 1 });

    renderPanel({ provider: soundButtons });

    expect(await screen.findByText("O Sound Buttons não devolveu nenhum som.")).toBeInTheDocument();
  });

  it("names the active provider in the no-search-results message", async () => {
    vi.mocked(getInstants).mockResolvedValue({ instants: [], pages: 1 });

    renderPanel({ search: "peixe", provider: soundButtons });

    expect(
      await screen.findByText("Nenhum som do Sound Buttons bate com “peixe”.")
    ).toBeInTheDocument();
  });

  it("falls back to naming MyInstants when no provider has resolved yet", async () => {
    vi.mocked(getInstants).mockResolvedValue({ instants: [], pages: 1 });

    renderPanel();

    expect(await screen.findByText("O MyInstants não devolveu nenhum som.")).toBeInTheDocument();
  });
});

// The backend reports most errors as HTTP 200 with no `data`, which used to
// reach this panel as `undefined` and unmount the tree to a blank window.
// service.js rejects instead now, and the panel never dereferences whatever
// it is handed.
describe("MyInstantsPanel when the listing does not arrive", () => {
  useFakes(null);

  it("shows the backend message and stays mounted when the call rejects", async () => {
    vi.mocked(getInstants).mockRejectedValue(
      new Error("O site myinstants.com respondeu com um status de erro")
    );

    const { snackbar, container } = renderPanel();

    await waitFor(() =>
      expect(snackbar.openSnackbar).toHaveBeenCalledWith({
        message: "O site myinstants.com respondeu com um status de erro"
      })
    );

    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("renders an empty catalogue rather than throwing if it is handed no listing at all", async () => {
    vi.mocked(getInstants).mockResolvedValue(noListing);

    const { snackbar } = renderPanel();

    expect(await screen.findByRole("heading", { name: "Nada no catálogo" })).toBeInTheDocument();
    expect(snackbar.openSnackbar).not.toHaveBeenCalled();
  });

  it("survives an undefined listing on the search path too", async () => {
    vi.mocked(getInstants).mockResolvedValue(noListing);

    const { rerenderWithSearch, container } = renderPanel({ search: "" });

    await waitFor(() => expect(getInstants).toHaveBeenCalled());
    rerenderWithSearch("boo");

    await waitFor(() => expect(getInstants).toHaveBeenCalledTimes(2));
    expect(container.firstChild).not.toBeNull();
  });
});

// getContent used to have no error handling at all, so a backend error
// reached the click handler as `undefined` and the button did nothing and
// said nothing. It rejects with the backend's message now, and that shows.
describe("MyInstantsPanel when a clip cannot be fetched", () => {
  useFakes();

  it("shows the backend message instead of failing silently", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockRejectedValue(new Error("Nenhuma URL enviada"));

    const { snackbar } = renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });

    await user.click(play("Primeiro"));

    await waitFor(() =>
      expect(snackbar.openSnackbar).toHaveBeenCalledWith({ message: "Nenhuma URL enviada" })
    );
    expect(FakeAudio.played).toEqual([]);
  });

  it("plays nothing and stays usable after the failure", async () => {
    const user = userEvent.setup();
    vi.mocked(getContent).mockRejectedValueOnce(new Error("Nenhuma URL enviada"));

    renderPanel();
    await screen.findByRole("article", { name: "Primeiro" });
    await user.click(play("Primeiro"));

    vi.mocked(getContent).mockResolvedValue({
      exists: true,
      content: "data:audio/mp3;base64,BBBB"
    });
    await user.click(play("Primeiro"));

    await waitFor(() => expect(FakeAudio.played).toEqual(["data:audio/mp3;base64,BBBB"]));
  });
});
