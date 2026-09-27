import { describe, it, expect } from "vitest";
import i18n from "./index";
import { apiErrorMessage } from "./apiError";
import { ApiError } from "../service";

describe("apiErrorMessage", () => {
  it("translates a recognized label, ignoring the backend's own message", async () => {
    await i18n.changeLanguage("pt-BR");
    const err = new ApiError("instant_not_found", "some other backend wording");

    expect(apiErrorMessage(i18n.t, err)).toBe("Não encontramos esse instant");
  });

  it("translates the same label differently once the language switches", async () => {
    await i18n.changeLanguage("en-US");
    const err = new ApiError("instant_not_found", "some other backend wording");

    expect(apiErrorMessage(i18n.t, err)).toBe("That instant couldn't be found");

    await i18n.changeLanguage("pt-BR");
  });

  it("falls back to the backend's message for an unrecognized label", () => {
    const err = new ApiError("a_future_label_this_catalog_does_not_know", "raw backend text");

    expect(apiErrorMessage(i18n.t, err)).toBe("raw backend text");
  });

  it("falls back to the message when there is no label at all", () => {
    const err = new ApiError(null, "no response from the server");

    expect(apiErrorMessage(i18n.t, err)).toBe("no response from the server");
  });

  it("reads .message off a plain Error, unrelated to any API label", () => {
    expect(apiErrorMessage(i18n.t, new Error("boom"))).toBe("boom");
  });

  it("stringifies anything else rather than throwing", () => {
    expect(apiErrorMessage(i18n.t, "not an error")).toBe("not an error");
  });
});
