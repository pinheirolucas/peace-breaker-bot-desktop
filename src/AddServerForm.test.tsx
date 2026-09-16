import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

import AddServerForm from "./AddServerForm";

const typed = "10.0.0.20:9001";
const resolved = "http://10.0.0.20:9001/api/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderForm(open = true) {
  const onCancel = vi.fn();
  const onAdd = vi.fn();
  render(<AddServerForm open={open} onCancel={onCancel} onAdd={onAdd} />);
  return { onCancel, onAdd };
}

function addressField() {
  return screen.getByRole("textbox", { name: "Endereço" });
}

function testButton() {
  return screen.getByRole("button", { name: "Testar conexão" });
}

function addButton() {
  return screen.getByRole("button", { name: "Adicionar" });
}

describe("AddServerForm", () => {
  it("opens with a blank field and Adicionar disabled, untested", () => {
    renderForm();

    expect(screen.getByRole("dialog", { name: "Adicionar servidor" })).toBeInTheDocument();
    expect(addressField()).toHaveValue("");
    expect(addButton()).toBeDisabled();
    expect(screen.queryByText("Conectado")).not.toBeInTheDocument();
    expect(screen.queryByText("Não foi possível conectar")).not.toBeInTheDocument();
  });

  it("rejects a malformed address on Testar conexão without any network call", async () => {
    let hit = false;
    server.use(
      http.get("*/bot/status", () => {
        hit = true;
        return HttpResponse.json({ data: { connected: false } });
      })
    );

    const user = userEvent.setup();
    renderForm();

    await user.type(addressField(), "not a server");
    await user.click(testButton());

    expect(screen.getByText("Endereço inválido")).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    expect(hit).toBe(false);
  });

  it("defaults a schemeless address to http, matching the placeholder's own shape", async () => {
    server.use(
      http.get(`${resolved}/bot/status`, () => HttpResponse.json({ data: { connected: false } }))
    );

    const user = userEvent.setup();
    renderForm();

    await user.type(addressField(), typed);
    await user.click(testButton());

    expect(await screen.findByText("Conectado")).toBeInTheDocument();
  });

  it("appends the backend's default API mount and version, not just the bare host", async () => {
    let requested: string | undefined;
    server.use(
      http.get("*/bot/status", ({ request }) => {
        requested = new URL(request.url).pathname;
        return HttpResponse.json({ data: { connected: false } });
      })
    );

    const user = userEvent.setup();
    renderForm();

    await user.type(addressField(), typed);
    await user.click(testButton());

    await screen.findByText("Conectado");
    expect(requested).toBe("/api/v1/bot/status");
  });

  it("respects an address that already carries its own path, rather than doubling it", async () => {
    const custom = "https://tunnel.example.com/custom";
    let requested: string | undefined;
    server.use(
      http.get("*/bot/status", ({ request }) => {
        requested = request.url;
        return HttpResponse.json({ data: { connected: false } });
      })
    );

    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await user.type(addressField(), custom);
    await user.click(testButton());
    await screen.findByText("Conectado");

    expect(requested).toBe(`${custom}/bot/status`);

    await user.click(addButton());
    expect(onAdd).toHaveBeenCalledWith(custom);
  });

  it("shows a failure status, and keeps Adicionar disabled, when the candidate doesn't answer", async () => {
    server.use(http.get(`${resolved}/bot/status`, () => HttpResponse.error()));

    const user = userEvent.setup();
    renderForm();

    await user.type(addressField(), typed);
    await user.click(testButton());

    expect(await screen.findByText("Não foi possível conectar")).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  it("enables Adicionar only once the test succeeds, and adds the exact tested address", async () => {
    server.use(
      http.get(`${resolved}/bot/status`, () => HttpResponse.json({ data: { connected: false } }))
    );

    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await user.type(addressField(), typed);
    await user.click(testButton());

    const add = await screen.findByRole("button", { name: "Adicionar" });
    expect(add).toBeEnabled();

    await user.click(add);
    expect(onAdd).toHaveBeenCalledWith(resolved);
  });

  it("invalidates a successful test the moment the address is edited again", async () => {
    server.use(
      http.get(`${resolved}/bot/status`, () => HttpResponse.json({ data: { connected: false } }))
    );

    const user = userEvent.setup();
    renderForm();

    await user.type(addressField(), typed);
    await user.click(testButton());
    await screen.findByText("Conectado");
    expect(addButton()).toBeEnabled();

    await user.type(addressField(), "9");

    expect(screen.queryByText("Conectado")).not.toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  it("routes Enter to test first, then to add once a test has passed", async () => {
    server.use(
      http.get(`${resolved}/bot/status`, () => HttpResponse.json({ data: { connected: false } }))
    );

    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await user.type(addressField(), `${typed}{Enter}`);
    await screen.findByText("Conectado");
    expect(onAdd).not.toHaveBeenCalled();

    await user.type(addressField(), "{Enter}");
    expect(onAdd).toHaveBeenCalledWith(resolved);
  });

  it("calls onCancel from the dialog's own Cancelar", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("resets on every open, rather than keep what was typed last time", async () => {
    server.use(
      http.get(`${resolved}/bot/status`, () => HttpResponse.json({ data: { connected: false } }))
    );

    const user = userEvent.setup();
    const { rerender } = render(
      <AddServerForm open={true} onCancel={vi.fn()} onAdd={vi.fn()} />
    );

    await user.type(addressField(), typed);
    await user.click(testButton());
    await screen.findByText("Conectado");

    rerender(<AddServerForm open={false} onCancel={vi.fn()} onAdd={vi.fn()} />);
    rerender(<AddServerForm open={true} onCancel={vi.fn()} onAdd={vi.fn()} />);

    expect(addressField()).toHaveValue("");
    expect(screen.queryByText("Conectado")).not.toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });
});
