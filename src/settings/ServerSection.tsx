import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Server } from "../../electron/discovery";
import { candidateFrom } from "../AddServerForm";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { CheckIcon, ErrorIcon, RefreshIcon, TrashIcon } from "../icons";
import { useServers } from "../hooks/useServers";
import { withManualServer } from "../lib/manualServer";
import { botLine, describeServer, formatApiUrl } from "../ServerMenu";
import { testServer } from "../service";
import type { BotStatus } from "../service";
import { useManualServers } from "../storage";
import useBotStatus from "../useBotStatus";
import { Group, GroupLabel, PageTitle } from "./Pref";

type TestState = "idle" | "testing" | "success" | "failure";

export interface ServerPaneProps {
  servers: Server[];
  activeUrl: string | null;
  healthy: boolean;
  botStatus: BotStatus | null;
  /** A search for servers is in flight. */
  scanning: boolean;
  onSelect: (server: Server) => void;
  onRescan: () => void;
  onRemove: (server: Server) => void;
  onAdd: (apiUrl: string) => void;
  /** Rejects when the address does not answer as a server. */
  onTest: (apiUrl: string) => Promise<unknown>;
}

export function ServerPane({
  servers,
  activeUrl,
  healthy,
  botStatus,
  scanning,
  onSelect,
  onRescan,
  onRemove,
  onAdd,
  onTest
}: ServerPaneProps) {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [tested, setTested] = useState<string | null>(null);

  const current = activeUrl ? formatApiUrl(activeUrl) : null;
  const sub = botLine(healthy, botStatus, t);

  const status = !current
    ? { tone: "none", title: t("server.none"), body: t("settings.server.noneBody"), retry: true }
    : !healthy
      ? { tone: "down", title: t("server.unresponsive", { address: current }), body: t("settings.server.downBody"), retry: true }
      : sub
        ? {
            tone: botStatus?.connected === false ? "away" : "ok",
            title: `${t("server.connectedTo")} ${current}`,
            body: sub,
            retry: false
          }
        : { tone: "ok", title: `${t("server.connectedTo")} ${current}`, body: t("settings.server.okBody"), retry: false };

  function edit(value: string) {
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
      await onTest(candidate);
      setTested(candidate);
      setTestState("success");
    } catch {
      setTested(null);
      setTestState("failure");
    }
  }

  function add() {
    if (testState !== "success" || !tested) return;

    onAdd(tested);
    edit("");
  }

  return (
    <>
      <PageTitle title={t("settings.sections.server")} lede={t("settings.server.lede")} />

      <GroupLabel>{t("settings.server.connection")}</GroupLabel>
      <div className="stat" role="status">
        <i
          className="dot"
          data-healthy={current ? healthy : undefined}
          data-bot-away={status.tone === "away" || undefined}
          data-none={status.tone === "none" || undefined}
          aria-hidden="true"
        />
        <div>
          <b>{status.title}</b>
          <span>{status.body}</span>
        </div>
        {status.retry && (
          <Button variant="secondary" onClick={onRescan}>
            {t("server.refresh")}
          </Button>
        )}
      </div>

      <GroupLabel>{t("settings.server.found")}</GroupLabel>
      <Group>
        {servers.length > 0 ? (
          <div role="radiogroup" aria-label={t("settings.server.active")}>
            {servers.map((server) => {
              const on = server.apiUrl === activeUrl;
              const line = server.manual ? t("settings.server.manual") : describeServer(server, t);

              return (
                <div className="pickrow" key={server.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className="pick"
                    onClick={() => onSelect(server)}
                  >
                    <span className="rd" data-state={on ? "checked" : "unchecked"}>
                      {on && <i className="ind" />}
                    </span>
                    <span className="preftx">
                      <b>{formatApiUrl(server.apiUrl)}</b>
                      {line && <span>{line}</span>}
                    </span>
                    <span className="tags">
                      {on && (
                        <i
                          className="dot"
                          data-healthy={healthy}
                          data-bot-away={(healthy && botStatus?.connected === false) || undefined}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </button>
                  {server.manual && (
                    <button
                      type="button"
                      className="ibtn ibtn--row"
                      aria-label={t("server.remove", { address: formatApiUrl(server.apiUrl) })}
                      onClick={() => onRemove(server)}
                    >
                      <TrashIcon size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sempty">
            <b>{t("server.none")}</b>
            {t("settings.server.noneList")}
          </div>
        )}
        <div className="prefrow">
          <div className="preftx">
            <span>{t("settings.server.background")}</span>
          </div>
          <Button variant="ghost" onClick={onRescan} disabled={scanning}>
            <RefreshIcon size={14} />
            {scanning ? t("settings.server.scanning") : t("server.refresh")}
          </Button>
        </div>
      </Group>

      <GroupLabel>{t("settings.server.addByAddress")}</GroupLabel>
      <Group>
        <div className="prefrow" data-stack>
          <div className="preftx">
            <b>{t("settings.server.addressTitle")}</b>
            <span>{t("settings.server.addressHint")}</span>
          </div>
          <form
            className="row2"
            style={{ flex: "1 1 100%" }}
            onSubmit={(event) => {
              event.preventDefault();
              if (testState === "success") add();
              else void test();
            }}
          >
            <Field
              label={t("server.addressLabel")}
              value={address}
              error={addressError}
              placeholder={t("server.addressPlaceholder")}
              onChange={(event) => edit(event.target.value)}
            />
            <Button variant="secondary" onClick={() => void test()} disabled={testState === "testing"}>
              {t("settings.server.test")}
            </Button>
            <Button onClick={add} disabled={testState !== "success"}>
              {t("server.addAction")}
            </Button>
          </form>
          {testState !== "idle" && (
            <span className={`tstatus ${testState === "success" ? "ok" : testState === "failure" ? "err" : ""}`} style={{ flexBasis: "100%" }}>
              {testState === "testing" && t("server.testing")}
              {testState === "success" && (
                <>
                  <CheckIcon size={14} />
                  {t("server.testSuccess")}
                </>
              )}
              {testState === "failure" && (
                <>
                  <ErrorIcon size={14} />
                  {t("server.testUnreachable")}
                </>
              )}
            </span>
          )}
        </div>
      </Group>
    </>
  );
}

/** Wired to the same things the server chip is: discovery, the saved pick and the manual list. */
export default function ServerSection() {
  const { servers, activeUrl, healthy, select, selectUrl, clearSelection, refresh } = useServers();
  const [, setManual] = useManualServers([]);
  const botStatus = useBotStatus(activeUrl);
  const [scanning, setScanning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ServerPane
      servers={servers}
      activeUrl={activeUrl}
      healthy={healthy}
      botStatus={botStatus}
      scanning={scanning}
      onSelect={select}
      onRescan={() => {
        refresh();
        setScanning(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setScanning(false), 1500);
      }}
      onRemove={(server) => {
        setManual((current) => current.filter((candidate) => candidate.id !== server.id));
        // The pick is a server that no longer exists: back to the first discovered one.
        if (server.apiUrl === activeUrl) clearSelection();
      }}
      onAdd={(apiUrl) => {
        setManual((current) => withManualServer(current, apiUrl));
        selectUrl(apiUrl);
      }}
      onTest={testServer}
    />
  );
}
