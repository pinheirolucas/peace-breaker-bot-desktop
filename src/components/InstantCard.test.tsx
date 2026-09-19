import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

describe("InstantCard", () => {
  it("names the card and its heading after the clip", () => {
    renderCard();

    expect(screen.getByRole("article", { name: "Primeiro" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Primeiro" })).toBeInTheDocument();
  });

  it("makes the card body the play control, named after the clip", async () => {
    const { button, onPlay } = renderCard();

    await userEvent.click(button("Primeiro"));

    expect(onPlay).toHaveBeenCalledWith(instant);
  });

  // The old card wrapped each icon button in a span that took the tooltip's
  // label, so the buttons themselves announced as a bare "button". Every
  // one of these now has a name of its own.
  it("gives every button an accessible name, body first", () => {
    const { card } = renderCard();

    const buttons = within(card).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveAccessibleName("Primeiro");
    expect(buttons[1]).toHaveAccessibleName("Reproduzir no Discord");
    expect(buttons[2]).toHaveAccessibleName("Parar");
    expect(buttons[3]).toHaveAccessibleName("Remover");
  });

  it("hands the instant to send-to-Discord and wires stop", async () => {
    const user = userEvent.setup();
    const { button, onPlayOnDiscord, onStop } = renderCard({ playback: "discord" });

    await user.click(button("Reproduzir no Discord"));
    await user.click(button("Parar"));

    expect(onPlayOnDiscord).toHaveBeenCalledWith(instant);
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

// The footer matrix from the design canvas. The two playback paths are
// mutually exclusive, so while one runs the other leaves every card.
describe("InstantCard state matrix", () => {
  interface Case {
    when: string;
    props: { playback: Playback; otherPlaying: boolean };
    play: boolean;
    discord: boolean;
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
      play: true, discord: true, stop: false, trail: true, live: false, dim: false
    },
    {
      when: "this card plays locally",
      props: { playback: "local", otherPlaying: false },
      play: true, discord: false, stop: true, trail: false, live: true, dim: false, chip: "Reproduzindo"
    },
    {
      when: "this card plays on Discord",
      props: { playback: "discord", otherPlaying: false },
      play: false, discord: true, stop: true, trail: false, live: true, dim: false, chip: "No Discord"
    },
    {
      when: "another card is playing",
      props: { playback: "idle", otherPlaying: true },
      play: false, discord: false, stop: false, trail: true, live: false, dim: true
    }
  ];

  it.each(cases)("when $when", ({ props, play, discord, stop, trail, live, dim, chip }) => {
    const { card, button } = renderCard(props);

    const expectEnabled = (el: HTMLElement, enabled: boolean) =>
      enabled ? expect(el).toBeEnabled() : expect(el).toBeDisabled();

    expectEnabled(button("Primeiro"), play);
    expectEnabled(button("Reproduzir no Discord"), discord);
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

  it("agrees with cardState, which is the single source of the rules", () => {
    expect(cardState("idle", true, null)).toEqual({
      live: false,
      dim: true,
      playDisabled: true,
      discordDisabled: true,
      botGated: false,
      stopDisabled: true,
      trailDisabled: false
    });
  });
});

// The bot-not-in-voice gate is a second, independent reason the
// send-to-Discord button can be disabled. The exact condition matters: only
// a confirmed `connected: false` gates it — `null` ("unknown": still
// loading, or an old/unreachable backend) must fall through to whatever
// today's busy/otherPlaying rule already says, unchanged.
describe("InstantCard bot-not-connected gate", () => {
  it("cardState disables Discord on an idle card when the bot is confirmed not connected", () => {
    const state = cardState("idle", false, { connected: false });

    expect(state.discordDisabled).toBe(true);
    expect(state.botGated).toBe(true);
  });

  // Regression guard: this would pass if the condition were written as
  // `!botStatus?.connected` instead of `botStatus?.connected === false`.
  it("cardState with an unknown bot status matches today's pre-existing behaviour exactly", () => {
    expect(cardState("idle", false, null)).toEqual({
      live: false,
      dim: false,
      playDisabled: false,
      discordDisabled: false,
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

  it("swaps the Discord button's label and disables it when the bot isn't in a channel", () => {
    const { button } = renderCard({ botStatus: { connected: false } });

    const discordButton = button("Bot fora de um canal de voz");
    expect(discordButton).toBeDisabled();
  });

  it("keeps the ordinary label and enabled state when the bot status is unknown", () => {
    const { button } = renderCard({ botStatus: null });

    expect(button("Reproduzir no Discord")).toBeEnabled();
  });

  it("keeps the ordinary label and enabled state when the bot is connected", () => {
    const { button } = renderCard({ botStatus: { connected: true } });

    expect(button("Reproduzir no Discord")).toBeEnabled();
  });
});

describe("InstantCard under en-US", () => {
  afterEach(async () => {
    await i18n.changeLanguage("pt-BR");
  });

  it("renders its own copy in English", async () => {
    await i18n.changeLanguage("en-US");
    const { card } = renderCard({ playback: "discord" });

    expect(within(card).getByRole("button", { name: "Play on Discord" })).toBeInTheDocument();
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

  it("swaps send and stop for rename, and keeps the trailing action", async () => {
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
