import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ServerChip } from "./ServerChip";

// The dot has three states, and only the accessible name (never the visible
// text, per CLAUDE.md's "Connection health is passive") carries the extra
// detail. The gate condition matters here the same way it does for
// cardState: only a confirmed `connected: false` may render the warning —
// `null` ("unknown") must look exactly like today.
describe("ServerChip", () => {
  it("is green with no aria-label override when healthy and the bot status is unknown", () => {
    render(<ServerChip address="localhost:9001" healthy botStatus={null} />);

    const button = screen.getByRole("button", { name: "localhost:9001" });
    expect(button.querySelector(".dot")).toHaveAttribute("data-healthy", "true");
    expect(button.querySelector(".dot")).toHaveAttribute("data-bot-away", "false");
  });

  it("is red on an unresponsive server, regardless of bot status", () => {
    render(
      <ServerChip
        address="localhost:9001"
        healthy={false}
        botStatus={{ connected: false }}
      />
    );

    const button = screen.getByRole("button", { name: "localhost:9001 não está respondendo" });
    expect(button.querySelector(".dot")).toHaveAttribute("data-healthy", "false");
  });

  it("is amber, with the not-in-voice fragment in its name, when reachable but the bot has no voice connection", () => {
    render(<ServerChip address="localhost:9001" healthy botStatus={{ connected: false }} />);

    const button = screen.getByRole("button", {
      name: "localhost:9001 · bot fora de um canal de voz"
    });
    expect(button.querySelector(".dot")).toHaveAttribute("data-healthy", "true");
    expect(button.querySelector(".dot")).toHaveAttribute("data-bot-away", "true");
  });

  it("stays green with no aria-label override while connected but the channel names haven't resolved yet", () => {
    render(<ServerChip address="localhost:9001" healthy botStatus={{ connected: true }} />);

    const button = screen.getByRole("button", { name: "localhost:9001" });
    expect(button.querySelector(".dot")).toHaveAttribute("data-bot-away", "false");
  });

  it("stays green but names the channel once guild and channel both resolve", () => {
    render(
      <ServerChip
        address="localhost:9001"
        healthy
        botStatus={{ connected: true, guildName: "Peace Breakers", channelName: "geral" }}
      />
    );

    const button = screen.getByRole("button", {
      name: "localhost:9001 · Peace Breakers #geral"
    });
    expect(button.querySelector(".dot")).toHaveAttribute("data-bot-away", "false");
  });

  it("never gates the amber state on an unhealthy server having a stale connected:false", () => {
    // healthy overrides: red wins even if a previous poll cached
    // connected:false before the server actually went unresponsive.
    render(<ServerChip address="localhost:9001" healthy={false} botStatus={{ connected: false }} />);

    expect(
      screen.getByRole("button", { name: "localhost:9001 não está respondendo" })
    ).toBeInTheDocument();
  });

  it("names no server, with nothing further to attach a label to, when there is no active server", () => {
    render(<ServerChip address={null} healthy={false} botStatus={null} />);

    expect(screen.getByRole("button", { name: "Nenhum servidor encontrado" })).toBeInTheDocument();
  });

  // In a Tight window the address text is hidden and the chip is only its
  // dot, and hidden text is not part of the accessible name — so the name
  // has to be set explicitly, even in the plain green state.
  it("always carries an explicit aria-label, so the name survives the address text being hidden", () => {
    render(<ServerChip address="localhost:9001" healthy botStatus={null} />);

    expect(screen.getByRole("button", { name: "localhost:9001" })).toHaveAttribute(
      "aria-label",
      "localhost:9001"
    );
  });
});
