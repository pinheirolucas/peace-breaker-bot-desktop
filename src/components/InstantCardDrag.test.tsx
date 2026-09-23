import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InstantCard from "./InstantCard";
import i18n from "../i18n";
import SnackbarContext from "../SnackbarContext";

const instant = { name: "Primeiro", url: "https://www.myinstants.com/a.mp3" };

const bridge = {
  prepare: vi.fn(),
  drag: vi.fn()
};

function renderCard(props: { onPlay?: () => void; organize?: boolean } = {}) {
  const openSnackbar = vi.fn();

  render(
    <SnackbarContext.Provider value={{ openSnackbar, closeSnackbar: vi.fn() }}>
      <InstantCard
        instant={instant}
        playback="idle"
        otherPlaying={false}
        botStatus={null}
        onPlay={props.onPlay ?? vi.fn()}
        onPlayOnDiscord={vi.fn()}
        onStop={vi.fn()}
        trail={{ label: "Remover", icon: <span>x</span>, onClick: vi.fn() }}
        organize={
          props.organize
            ? { position: 1, total: 1, onRename: vi.fn() }
            : undefined
        }
      />
    </SnackbarContext.Provider>
  );

  return { openSnackbar, card: screen.getByRole("article") };
}

describe("dragging a card out", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    bridge.prepare.mockReset().mockResolvedValue("ready");
    bridge.drag.mockReset().mockResolvedValue("started");
    window.instantsClip = bridge;
  });

  afterEach(() => {
    delete window.instantsClip;
  });

  it("prepares the file on press, and a press that stays put is a click", () => {
    const onPlay = vi.fn();
    const { card } = renderCard({ onPlay });

    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10, pointerType: "mouse" });
    expect(bridge.prepare).toHaveBeenCalledWith({ name: "Primeiro", url: instant.url });
    expect(card).toHaveAttribute("data-clip", "pressed");

    fireEvent.pointerMove(window, { clientX: 13, clientY: 12 });
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getByRole("button", { name: "Primeiro" }));

    expect(bridge.drag).not.toHaveBeenCalled();
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(card).not.toHaveAttribute("data-clip");
  });

  it("starts the drag at 6px and swallows the click that follows", async () => {
    const onPlay = vi.fn();
    const { card } = renderCard({ onPlay });

    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10, pointerType: "mouse" });
    await act(async () => {
      fireEvent.pointerMove(window, { clientX: 16, clientY: 10 });
    });

    expect(bridge.drag).toHaveBeenCalledWith({ name: "Primeiro", url: instant.url });
    expect(card).toHaveAttribute("data-clip", "dragging");

    fireEvent.click(screen.getByRole("button", { name: "Primeiro" }));
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("says so when the file could not be prepared", async () => {
    bridge.drag.mockResolvedValue("failed");
    const { card, openSnackbar } = renderCard();

    fireEvent.pointerDown(card, { button: 0, clientX: 0, clientY: 0, pointerType: "mouse" });
    await act(async () => {
      fireEvent.pointerMove(window, { clientX: 20, clientY: 0 });
    });

    expect(card).toHaveAttribute("data-clip", "unavailable");
    expect(openSnackbar).toHaveBeenCalledWith({
      message: "Couldn't prepare the file. Try dragging again."
    });
  });

  it("does nothing from the footer", () => {
    const { card } = renderCard();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Play on Discord" }), {
      button: 0,
      pointerType: "mouse"
    });
    expect(bridge.prepare).not.toHaveBeenCalled();
    expect(card).not.toHaveAttribute("data-clip");
  });

  it("is off in Organizar", () => {
    const { card } = renderCard({ organize: true });
    fireEvent.pointerDown(card, { button: 0, pointerType: "mouse" });
    expect(bridge.prepare).not.toHaveBeenCalled();
  });

  it("is off in a plain browser tab", () => {
    delete window.instantsClip;
    const { card } = renderCard();
    fireEvent.pointerDown(card, { button: 0, pointerType: "mouse" });
    expect(card).not.toHaveAttribute("data-clip");
  });
});
