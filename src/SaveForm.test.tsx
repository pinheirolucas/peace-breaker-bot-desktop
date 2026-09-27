import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SaveForm from "./SaveForm";

function renderForm(open = true) {
  const onCancel = vi.fn();
  const onSave = vi.fn();
  render(<SaveForm open={open} onCancel={onCancel} onSave={onSave} />);
  return { onCancel, onSave };
}

describe("SaveForm", () => {
  it("opens with both fields blank and Salvar disabled", () => {
    renderForm();

    expect(screen.getByRole("dialog", { name: "Adicionar instant" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Link" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("shows validation errors only after each field is touched", async () => {
    const user = userEvent.setup();
    renderForm();

    const name = screen.getByRole("textbox", { name: "Nome" });
    expect(screen.queryByText("Use pelo menos 3 caracteres")).toBeNull();

    await user.type(name, "ab");
    expect(screen.getByText("Use pelo menos 3 caracteres")).toBeInTheDocument();

    await user.type(name, "c");
    expect(screen.queryByText("Use pelo menos 3 caracteres")).toBeNull();
  });

  it("enables Salvar once both fields pass, and calls onSave with them", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();

    await user.type(screen.getByRole("textbox", { name: "Nome" }), "Vish");
    await user.type(
      screen.getByRole("textbox", { name: "Link" }),
      "https://www.myinstants.com/v/"
    );

    const save = screen.getByRole("button", { name: "Salvar" });
    expect(save).toBeEnabled();

    await user.click(save);
    expect(onSave).toHaveBeenCalledWith("Vish", "https://www.myinstants.com/v/");
  });

  it("touches both fields and blocks submit on Enter while invalid", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();

    await user.type(screen.getByRole("textbox", { name: "Nome" }), "ab{Enter}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Use pelo menos 3 caracteres")).toBeInTheDocument();
    expect(screen.getByText("Link inválido")).toBeInTheDocument();
  });

  it("calls onCancel from the dialog's own Cancelar", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
