import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiVersionPath } from "../electron/discovery";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { Field } from "./components/Field";
import { CheckIcon, ErrorIcon, RefreshIcon } from "./icons";
import { normalizeApiUrl, testServer } from "./service";

type TestState = "idle" | "testing" | "success" | "failure";

export interface AddServerFormProps {
  open: boolean;
  onCancel: () => void;
  onAdd: (apiUrl: string) => void;
}

const defaultApiPath = `/api${apiVersionPath}`;

/** What a typed address becomes: a scheme and the API path added when it has none, or null when it is not an address at all. */
export function candidateFrom(input: string): string | null {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const normalized = normalizeApiUrl(withScheme);

  if (!normalized) {
    return null;
  }

  return new URL(normalized).pathname === "/" ? `${normalized}${defaultApiPath}` : normalized;
}

export default function AddServerForm({ open, onCancel, onAdd }: AddServerFormProps) {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [tested, setTested] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAddress("");
      setAddressError("");
      setTestState("idle");
      setTested(null);
    }
  }, [open]);

  function handleAddressChange(value: string) {
    setAddress(value);
    setAddressError("");
    setTestState("idle");
    setTested(null);
  }

  async function test() {
    const candidate = candidateFrom(address);

    if (!candidate) {
      setAddressError(t("server.addressError"));
      setTestState("idle");
      return;
    }

    setAddressError("");
    setTestState("testing");

    try {
      await testServer(candidate);
      setTested(candidate);
      setTestState("success");
    } catch {
      setTested(null);
      setTestState("failure");
    }
  }

  function submit() {
    if (testState !== "success" || !tested) {
      return;
    }

    onAdd(tested);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (testState === "success") {
      submit();
    } else {
      test();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={t("server.add")}
      description={t("server.addDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={testState !== "success"}>
            {t("server.addAction")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event: FormEvent) => event.preventDefault()}
        onKeyDown={handleKeyDown}
        style={{ display: "grid", gap: 12 }}
      >
        <Field
          label={t("server.addressLabel")}
          value={address}
          error={addressError}
          placeholder={t("server.addressPlaceholder")}
          autoFocus
          onChange={(event) => handleAddressChange(event.target.value)}
        />
        <div className="testrow">
          <Button variant="secondary" onClick={test} disabled={testState === "testing"}>
            <RefreshIcon size={14} />
            {t("server.testConnection")}
          </Button>
          {testState === "testing" && <span className="tstatus">{t("server.testing")}</span>}
          {testState === "success" && (
            <span className="tstatus ok">
              <CheckIcon size={14} />
              {t("server.testSuccess")}
            </span>
          )}
          {testState === "failure" && (
            <span className="tstatus err">
              <ErrorIcon size={14} />
              {t("server.testUnreachable")}
            </span>
          )}
        </div>
      </form>
    </Dialog>
  );
}
