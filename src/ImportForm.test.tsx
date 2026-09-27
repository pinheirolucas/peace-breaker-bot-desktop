import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import ImportForm from "./ImportForm";

const existing = [
  { name: "Primeiro", url: "https://www.myinstants.com/a/" },
  { name: "Segundo", url: "https://www.myinstants.com/b/" }
];

const incoming = [
  // Same url as "Primeiro", different name — this is what distinguishes a
  // replace from a merge.
  { name: "Primeiro renomeado", url: "https://www.myinstants.com/a/" },
  { name: "Terceiro", url: "https://www.myinstants.com/c/" }
];

function storedInstants() {
  return JSON.parse(localStorage.getItem("instants") ?? "null");
}

function jsonFile(content: unknown, name = "config.json") {
  return new File([JSON.stringify(content)], name, { type: "application/json" });
}

function renderForm({ instants = existing } = {}) {
  localStorage.setItem("instants", JSON.stringify(instants));

  const onClose = vi.fn();
  const result = render(<ImportForm open onClose={onClose} />);

  return { ...result, onClose };
}

// react-dropzone's file input is deliberately hidden, so there is nothing to
// query by role or label. Uploading straight to the input is what
// react-dropzone's own docs suggest for tests.
function fileInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

async function upload(user: UserEvent, file: File) {
  await user.upload(fileInput(), file);
}

// The options only appear once the file has actually been read and parsed,
// so Importar is never offered against content that has not arrived.
async function uploadParsed(user: UserEvent, file = jsonFile({ instants: incoming })) {
  await upload(user, file);
  await screen.findByText("O que você quer importar?");
}

// user-event replicates the file picker's own `accept` filtering, and
// react-dropzone sets accept="application/json,.json" on its input — so by
// default a .txt never reaches the component and the rejection path is
// unreachable. Dragging a file onto the zone is not filtered like that in a
// real browser, which is exactly how a user gets here, so the filter is
// switched off rather than worked around.
const draggingUser = () => userEvent.setup({ applyAccept: false });

describe("ImportForm", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("asks for a file and offers nothing else until one arrives", () => {
    renderForm();

    expect(screen.getByText("Arraste o arquivo para cá")).toBeInTheDocument();
    expect(screen.getByText("ou clique para escolher no computador")).toBeInTheDocument();
    expect(screen.queryByText("O que você quer importar?")).toBeNull();
    expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
  });

  it("names the file and counts what is in it once it is read", async () => {
    const user = userEvent.setup();
    renderForm();

    await upload(user, jsonFile({ instants: incoming }));

    expect(await screen.findByText("config.json")).toBeInTheDocument();
    expect(await screen.findByText("2 instants no arquivo")).toBeInTheDocument();
    expect(screen.getByText("O que você quer importar?")).toBeInTheDocument();
  });

  it("counts a single instant in the singular", async () => {
    const user = userEvent.setup();
    renderForm();

    await upload(user, jsonFile({ instants: [incoming[1]] }));

    expect(await screen.findByText("1 instant no arquivo")).toBeInTheDocument();
  });

  it("keeps Importar dead until both the switch and a strategy are chosen", async () => {
    const user = userEvent.setup();
    renderForm();
    await uploadParsed(user);

    const confirm = screen.getByRole("button", { name: "Importar" });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("switch", { name: "Instants" }));
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Substituir tudo" }));
    expect(confirm).toBeEnabled();
  });

  it('replaces the stored instants outright with "Substituir tudo"', async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();
    await uploadParsed(user);

    await user.click(screen.getByRole("switch", { name: "Instants" }));
    await user.click(screen.getByRole("radio", { name: "Substituir tudo" }));
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(storedInstants()).toEqual(incoming);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the stored instants and adds only new urls with "Manter os meus"', async () => {
    const user = userEvent.setup();
    renderForm();
    await uploadParsed(user);

    await user.click(screen.getByRole("switch", { name: "Instants" }));
    await user.click(screen.getByRole("radio", { name: "Manter os meus" }));
    await user.click(screen.getByRole("button", { name: "Importar" }));

    // "Primeiro renomeado" shares a url with the stored "Primeiro", so the
    // stored name wins and only "Terceiro" is appended.
    expect(storedInstants()).toEqual([...existing, incoming[1]]);
  });

  it("treats a file with no instants key as an empty import", async () => {
    const user = userEvent.setup();
    renderForm();
    await uploadParsed(user, jsonFile({ theme: "dark" }));

    expect(screen.getByText("0 instant no arquivo")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Instants" }));
    await user.click(screen.getByRole("radio", { name: "Substituir tudo" }));
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(storedInstants()).toEqual([]);
  });

  it("leaves storage alone when the import switch is off", async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();
    await uploadParsed(user);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(storedInstants()).toEqual(existing);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rejects a file that is not .json", async () => {
    const user = draggingUser();
    renderForm();

    await upload(user, new File(["hello"], "notes.txt", { type: "text/plain" }));

    expect(await screen.findByText("Esse arquivo não serve")).toBeInTheDocument();
    expect(screen.getByText("Apenas arquivos .json são aceitos.")).toBeInTheDocument();
    expect(screen.queryByText("O que você quer importar?")).toBeNull();
  });

  it("reports a .json file whose contents are not valid JSON", async () => {
    const user = userEvent.setup();
    renderForm();

    await upload(user, new File(["{ not json"], "config.json", { type: "application/json" }));

    expect(await screen.findByText("O conteúdo não é um JSON válido.")).toBeInTheDocument();
    expect(screen.queryByText("O que você quer importar?")).toBeNull();
  });

  // Pinned because the source carries a comment explaining it: react-dropzone
  // hands back a fresh acceptedFiles identity even on a rejection, so split
  // into two effects the acceptance one ran second and cleared the error.
  it("keeps the rejection message visible instead of clearing it", async () => {
    const user = draggingUser();
    renderForm();

    await upload(user, new File(["hello"], "notes.txt", { type: "text/plain" }));
    const message = await screen.findByText("Apenas arquivos .json são aceitos.");

    await waitFor(() => expect(message).toBeInTheDocument());
    expect(screen.queryByText("Arraste o arquivo para cá")).toBeNull();
  });

  it("recovers when a good file follows a rejected one", async () => {
    const user = draggingUser();
    renderForm();

    await upload(user, new File(["hello"], "notes.txt", { type: "text/plain" }));
    await screen.findByText("Apenas arquivos .json são aceitos.");

    await upload(user, jsonFile({ instants: incoming }, "good.json"));

    expect(await screen.findByText("good.json")).toBeInTheDocument();
    expect(screen.queryByText("Apenas arquivos .json são aceitos.")).toBeNull();
  });

  it("offers exactly the two strategies, with neither preselected", async () => {
    const user = userEvent.setup();
    renderForm();
    await uploadParsed(user);
    await user.click(screen.getByRole("switch", { name: "Instants" }));

    const radios = within(screen.getByRole("radiogroup")).getAllByRole("radio");

    expect(radios).toHaveLength(2);
    radios.forEach(radio => expect(radio).not.toBeChecked());
  });

  // The platform flips the footer visually (primary sits left on Windows);
  // the DOM keeps reading order everywhere, so keyboard and screen-reader
  // order never depends on the OS.
  it("keeps the footer in reading order: cancel, then confirm", () => {
    renderForm();

    const cancel = screen.getByRole("button", { name: "Cancelar" });
    const confirm = screen.getByRole("button", { name: "Importar" });

    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
