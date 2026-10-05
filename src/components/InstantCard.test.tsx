import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InstantCard, { cardState } from "./InstantCard";
import type { InstantCardProps, Playback } from "./InstantCard";
import i18n from "../i18n";
import { slotFor } from "../lib/slot";

const instant = { name: "Primeiro", url: "https://www.myinstants.com/a/" };

function renderCard(props: Partial<InstantCardProps> = {}) {
  const handlers = {
    onPlay: vi.fn(),
    onPlayOnDiscord: vi.fn(),
    onStop: vi.fn(),
    onTrail: vi.fn()
  };

  render(
    <InstantCard
      instant={instant}
      playback="idle"
      otherPlaying={false}
      botStatus={null}
      onPlay={handlers.onPlay}
      onPlayOnDiscord={handlers.onPlayOnDiscord}
      onStop={handlers.onStop}
      trail={{ label: "Remover", icon: <span>x</span>, onClick: handlers.onTrail }}
      {...props}
    />
  );

  const card = screen.getByRole("article", { name: "Primeiro" });
  const button = (name: string) => within(card).getByRole("button", { name });

  return { ...handlers, card, button };
}

function middleClick(el: HTMLElement) {
  fireEvent.mouseDown(el, { button: 1 });
  fireEvent(el, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
}

afterEach(() => localStorage.clear());

describe("InstantCard", () => {
  it("names the card and its heading after the clip", () => {
    renderCard();

    expect(screen.getByRole("article", { name: "Primeiro" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Primeiro" })).toBeInTheDocument();
  });

  it("sends to Discord on a click, by default", async () => {
    const { button, onPlay, onPlayOnDiscord } = renderCard();

    await userEvent.click(button("Primeiro"));

    expect(onPlayOnDiscord).toHaveBeenCalledWith(instant);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("plays here on a middle click, Shift + click and Shift + Enter, and says so", async () => {
    const user = userEvent.setup();
    const onSecondary = vi.fn();
    const { button, onPlay, onPlayOnDiscord } = renderCard({ onSecondary });

    middleClick(button("Primeiro"));
    await user.keyboard("{Shift>}");
    await user.click(button("Primeiro"));
    await user.keyboard("{/Shift}");
    button("Primeiro").focus();
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(onPlay).toHaveBeenCalledTimes(3);
    expect(onPlayOnDiscord).not.toHaveBeenCalled();
    expect(onSecondary).toHaveBeenCalledTimes(3);
  });

  it("keeps the middle press from scrolling or pasting", () => {
    const { button } = renderCard();

    expect(fireEvent.mouseDown(button("Primeiro"), { button: 1 })).toBe(false);
    expect(fireEvent.mouseDown(button("Primeiro"), { button: 0 })).toBe(true);
  });

  it("swaps the two when the click is set to play here", async () => {
    localStorage.setItem("mainPlayback", JSON.stringify("local"));
    const { button, onPlay, onPlayOnDiscord } = renderCard();

    await userEvent.click(button("Primeiro"));
    middleClick(button("Primeiro"));

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlayOnDiscord).toHaveBeenCalledTimes(1);
    expect(button("Primeiro")).toHaveAttribute("title", "Reproduzir aqui · clique do meio: reproduzir no Discord");
  });

  it("names both presses in the body's tooltip", () => {
    const { button } = renderCard();

    expect(button("Primeiro")).toHaveAttribute("title", "Reproduzir no Discord · clique do meio: reproduzir aqui");
  });

  // The old card wrapped each icon button in a span that took the tooltip's
  // label, so the buttons themselves announced as a bare "button". Every
  // one of these now has a name of its own.
  it("gives every button an accessible name, body first, and has no send button", () => {
    const { card } = renderCard();

    const buttons = within(card).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName("Primeiro");
    expect(buttons[1]).toHaveAccessibleName("Parar");
    expect(buttons[2]).toHaveAccessibleName("Remover");
  });

  it("wires stop", async () => {
    const { button, onStop } = renderCard({ playback: "discord" });

    await userEvent.click(button("Parar"));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("fires the trailing action on an idle card", async () => {
    const { button, onTrail } = renderCard();

    await userEvent.click(button("Remover"));

    expect(onTrail).toHaveBeenCalledTimes(1);
  });

  it("takes its colour from a palette slot keyed on the url", () => {
    const { card } = renderCard();

    expect(card).toHaveClass("pad", slotFor(instant.url));
  });

  it("announces a toggle action's state", () => {
    const { button } = renderCard({
      trail: { label: "Favoritar", icon: <span>*</span>, pressed: true, onClick: () => {} }
    });

    expect(button("Favoritar")).toHaveAttribute("aria-pressed", "true");
  });
});

// The two playback paths are mutually exclusive, so while one runs the other
// is refused on every card; the body is disabled only when both are.
describe("InstantCard state matrix", () => {
  interface Case {
    when: string;
    props: { playback: Playback; otherPlaying: boolean };
    body: boolean;
    stop: boolean;
    trail: boolean;
    live: boolean;
    dim: boolean;
    chip?: string;
  }

  const cases: Case[] = [
    {
      when: "nothing is playing",
      props: { playback: "idle", otherPlaying: false },
      body: true, stop: false, trail: true, live: false, dim: false
    },
    {
      when: "this card plays locally",
      props: { playback: "local", otherPlaying: false },
      body: true, stop: true, trail: false, live: true, dim: false, chip: "Reproduzindo"
    },
    {
      when: "this card plays on Discord",
      props: { playback: "discord", otherPlaying: false },
      body: true, stop: true, trail: false, live: true, dim: false, chip: "No Discord"
    },
    {
      when: "another card is playing",
      props: { playback: "idle", otherPlaying: true },
      body: false, stop: false, trail: true, live: false, dim: true
    }
  ];

  it.each(cases)("when $when", ({ props, body, stop, trail, live, dim, chip }) => {
    const { card, button } = renderCard(props);

    const expectEnabled = (el: HTMLElement, enabled: boolean) =>
      enabled ? expect(el).toBeEnabled() : expect(el).toBeDisabled();

    expectEnabled(button("Primeiro"), body);
    expectEnabled(button("Parar"), stop);
    expectEnabled(button("Remover"), trail);
    expect(card).toHaveAttribute("data-live", String(live));
    expect(card).toHaveAttribute("data-dim", String(dim));

    if (chip) {
      expect(within(card).getByText(chip)).toBeInTheDocument();
    } else {
      expect(within(card).queryByText(/Reproduzindo|No Discord/)).toBeNull();
    }
  });

  it("re-sends a clip already on Discord, and refuses to play it here meanwhile", async () => {
    const onRefuse = vi.fn();
    const { button, onPlay, onPlayOnDiscord } = renderCard({ playback: "discord", onRefuse });

    await userEvent.click(button("Primeiro"));
    middleClick(button("Primeiro"));

    expect(onPlayOnDiscord).toHaveBeenCalledWith(instant);
    expect(onPlay).not.toHaveBeenCalled();
    expect(onRefuse).toHaveBeenCalledWith(instant, "busy");
  });

  it("agrees with cardState, which is the single source of the rules", () => {
    expect(cardState("idle", true, null)).toEqual({
      live: false,
      dim: true,
      playDisabled: true,
      discordDisabled: true,
      bodyDisabled: true,
      botGated: false,
      stopDisabled: true,
      trailDisabled: false
    });
  });
});

// Only a confirmed `connected: false` gates Discord — `null` ("unknown":
// still loading, or an old/unreachable backend) must fall through to the
// busy rule, unchanged.
describe("InstantCard bot-not-connected gate", () => {
  it("cardState disables Discord on an idle card when the bot is confirmed not connected", () => {
    const state = cardState("idle", false, { connected: false });

    expect(state.discordDisabled).toBe(true);
    expect(state.botGated).toBe(true);
    expect(state.bodyDisabled).toBe(false);
  });

  // Regression guard: this would pass if the condition were written as
  // `!botStatus?.connected` instead of `botStatus?.connected === false`.
  it("cardState with an unknown bot status gates nothing", () => {
    expect(cardState("idle", false, null)).toEqual({
      live: false,
      dim: false,
      playDisabled: false,
      discordDisabled: false,
      bodyDisabled: false,
      botGated: false,
      stopDisabled: true,
      trailDisabled: false
    });
  });

  it("does not gate the card that is itself the one playing on Discord", () => {
    const state = cardState("discord", false, { connected: false });

    expect(state.discordDisabled).toBe(false);
    expect(state.botGated).toBe(false);
  });

  it("refuses a click for Discord while the bot is out of its channel, and never plays here instead", async () => {
    const onRefuse = vi.fn();
    const { button, onPlay, onPlayOnDiscord } = renderCard({ botStatus: { connected: false }, onRefuse });

    await userEvent.click(button("Primeiro"));

    expect(onRefuse).toHaveBeenCalledWith(instant, "bot");
    expect(onPlay).not.toHaveBeenCalled();
    expect(onPlayOnDiscord).not.toHaveBeenCalled();
  });

  it("still plays here on a middle click while the bot is out of its channel", () => {
    const { button, onPlay } = renderCard({ botStatus: { connected: false } });

    middleClick(button("Primeiro"));

    expect(onPlay).toHaveBeenCalledWith(instant);
  });

  it("sends while the bot status is unknown", async () => {
    const { button, onPlayOnDiscord } = renderCard({ botStatus: null });

    await userEvent.click(button("Primeiro"));

    expect(onPlayOnDiscord).toHaveBeenCalledWith(instant);
  });
});

describe("InstantCard under en-US", () => {
  afterEach(async () => {
    await i18n.changeLanguage("pt-BR");
  });

  it("renders its own copy in English", async () => {
    await i18n.changeLanguage("en-US");
    const { card } = renderCard({ playback: "discord" });

    expect(within(card).getByRole("button", { name: "Primeiro" })).toHaveAttribute("title", "Play on Discord · middle click: play here");
    expect(within(card).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(within(card).getByText("On Discord")).toBeInTheDocument();
  });
});

describe("InstantCard in Organizar", () => {
  const organize = { position: 3, total: 12, onRename: vi.fn() };

  it("makes the name button a handle named after its position, not a play control", async () => {
    const { card, onPlay } = renderCard({ organize });
    const user = userEvent.setup();

    const handle = within(card).getByRole("button", { name: "Mover Primeiro, posição 3 de 12" });
    await user.click(handle);

    expect(onPlay).not.toHaveBeenCalled();
  });

  it("keeps naming the card after the clip", () => {
    renderCard({ organize });

    expect(screen.getByRole("article", { name: "Primeiro" })).toBeInTheDocument();
  });

  it("swaps stop for rename, and keeps the trailing action", async () => {
    const { button, onTrail } = renderCard({ organize });
    const user = userEvent.setup();

    await user.click(button("Renomear"));
    await user.click(button("Remover"));

    expect(organize.onRename).toHaveBeenCalledOnce();
    expect(onTrail).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Parar" })).toBeNull();
  });

  it("shows the position on the copy that follows the pointer, hidden from assistive tech", () => {
    const { container } = render(
      <InstantCard
        instant={instant}
        playback="idle"
        otherPlaying={false}
        botStatus={null}
        onPlay={vi.fn()}
        onPlayOnDiscord={vi.fn()}
        onStop={vi.fn()}
        trail={{ label: "Remover", icon: <span>x</span>, onClick: vi.fn() }}
        organize={{ ...organize, drag: "overlay" }}
      />
    );

    expect(screen.getByText("3 de 12")).toBeInTheDocument();
    // The real card is announced through the live region; this copy would
    // read as a second card of the same name.
    expect(container.querySelector("article")).toHaveAttribute("aria-hidden", "true");
  });
});
