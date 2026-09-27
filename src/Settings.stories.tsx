import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { ReactNode } from "react";
import type { Server } from "../electron/discovery";
import { defaultPresenceSettings } from "../electron/presence";
import type { PresenceSettings, TrayState } from "../electron/presence";
import { modifiersFor } from "../electron/shortcuts";
import type { GlobalModifier } from "../electron/shortcuts";
import type { SettingsPane } from "../electron/settings";
import { SettingsShell } from "./Settings";
import type { BotStatus, ProviderInfo } from "./service";
import { DataPane } from "./settings/DataSection";
import { ExplorePane } from "./settings/ExploreSection";
import { GeneralPane } from "./settings/GeneralSection";
import { KeysPane } from "./settings/KeysSection";
import { PresencePane } from "./settings/PresenceSection";
import { ServerPane } from "./settings/ServerSection";
import type { UpdateStatus } from "./settings/useUpdateCheck";
import type { LanguageChoice } from "./storage";
import type { PlatformId } from "./themes";
import type { DesktopId } from "./hooks/usePlatform";
import type { Region } from "./regions";

const meta: Meta = { title: "Configurações/Janela" };
export default meta;

// The window is the container: 880 x 620 by default and 640 x 460 at the minimum,
// which is under 720 and so draws the icon rail. The Tema x Modo x Sistema (and
// Desktop) toolbar decides the palette and the dialect: macOS a filled pill on the
// active item, Windows and KDE an accent line beside it, GNOME a grey raised item.

const noop = () => undefined;

const estudio: Server = {
  id: "estudio",
  apiUrl: "http://192.168.0.12:9001/api/v1",
  address: "192.168.0.12",
  port: 9001,
  hostname: "estudio.local",
  isLocal: true
};
const sala: Server = { ...estudio, id: "sala", apiUrl: "http://192.168.0.34:9001/api/v1", address: "192.168.0.34", hostname: "sala-tv.local", isLocal: false };
const remote: Server = { ...estudio, id: "remote", apiUrl: "https://bot.exemplo.dev/api/v1", address: null, port: 443, hostname: null, isLocal: false, manual: true };

const providers: ProviderInfo[] = [
  { key: "myinstants", name: "MyInstants", supportsSearch: true, supportsRegion: true },
  { key: "soundboardguy", name: "Soundboard Guy", supportsSearch: true, supportsRegion: false },
  { key: "soundbuttons", name: "Sound Buttons", supportsSearch: true, supportsRegion: false }
];

const inChannel: BotStatus = { connected: true, guildName: "Casa", channelName: "geral" };

const platform = (os: unknown): PlatformId => (os === "win" || os === "linux" ? os : "mac");
const desktopOf = (globals: Record<string, unknown>): DesktopId | null =>
  globals.os === "linux" ? (globals.desktop === "kde" ? "kde" : "gnome") : null;
const nodePlatform = (os: PlatformId) => (os === "mac" ? "darwin" : os === "win" ? "win32" : "linux");

type ServerScenario = "connected" | "noServer" | "offline" | "botAway" | "manual";
type Scenario = {
  server?: ServerScenario;
  update?: UpdateStatus;
  /** The site the Explorar pane starts on. */
  provider?: string;
  conflict?: boolean;
  presence?: Partial<PresenceSettings>;
  quickAccessShortcut?: boolean;
  confirming?: boolean;
  /** Which tray glyph the preview shows. */
  glyph?: TrayState;
  onOpenAppearance?: () => void;
};

interface WindowProps {
  os: PlatformId;
  desktop: DesktopId | null;
  section: SettingsPane;
  query?: string;
  compact?: boolean;
  scenario?: Scenario;
}

/** The whole window, at true size, with every pane running on local state. */
function Window({ os, desktop, section: initial, query: initialQuery = "", compact = false, scenario = {} }: WindowProps) {
  const [section, setSection] = useState<SettingsPane>(initial);
  const [query, setQuery] = useState(initialQuery);

  const [language, setLanguage] = useState<LanguageChoice>("auto");

  const kind = scenario.server ?? "connected";
  const [manual, setManual] = useState<Server[]>(kind === "manual" ? [remote] : []);
  const discovered = kind === "noServer" ? [] : [estudio, sala];
  const servers = [...discovered, ...manual];
  const [active, setActive] = useState<string | null>(kind === "noServer" ? null : estudio.apiUrl);

  const [provider, setProvider] = useState(scenario.provider ?? "myinstants");
  const [region, setRegion] = useState<Region>("br");
  const current = providers.find((candidate) => candidate.key === provider) ?? providers[0];

  const modifiers = modifiersFor(nodePlatform(os));
  const [globalOn, setGlobalOn] = useState(true);
  const [globalMod, setGlobalMod] = useState<GlobalModifier>(modifiers[0]);
  const [quickOn, setQuickOn] = useState(scenario.quickAccessShortcut ?? false);
  const [quickMod, setQuickMod] = useState<GlobalModifier>(modifiers[0]);
  const [conflict, setConflict] = useState(scenario.conflict ?? false);

  const [presence, setPresence] = useState<PresenceSettings>({
    ...defaultPresenceSettings,
    tray: true,
    quickAccess: true,
    ...scenario.presence
  });

  const panes: Record<SettingsPane, ReactNode> = {
    general: (
      <GeneralPane
        language={language}
        onLanguage={setLanguage}
        version="0.1.15"
        update={scenario.update ?? { state: "idle" }}
        canCheck
        onCheck={noop}
      />
    ),
    server: (
      <ServerPane
        servers={servers}
        activeUrl={active}
        healthy={kind !== "offline"}
        botStatus={kind === "botAway" ? { connected: false } : kind === "noServer" ? null : inChannel}
        scanning={false}
        onSelect={(server) => setActive(server.apiUrl)}
        onRescan={noop}
        onRemove={(server) => {
          setManual((list) => list.filter((candidate) => candidate.id !== server.id));
          if (server.apiUrl === active) setActive(null);
        }}
        onAdd={(apiUrl) => {
          setManual((list) => [...list, { ...remote, id: apiUrl, apiUrl }]);
          setActive(apiUrl);
        }}
        onTest={() => new Promise((resolve) => setTimeout(resolve, 500))}
      />
    ),
    explore: (
      <ExplorePane
        providers={providers}
        provider={current}
        onProvider={setProvider}
        regionSupported={current.supportsRegion}
        region={region}
        language="pt-BR"
        onRegion={setRegion}
        onReset={() => {
          setProvider("myinstants");
          setRegion("br");
        }}
      />
    ),
    keys: (
      <KeysPane
        os={os}
        globalKeys={{ available: true, enabled: globalOn, modifier: globalMod, modifiers, setEnabled: setGlobalOn, setModifier: setGlobalMod }}
        quickAccess={{
          available: true,
          enabled: quickOn,
          modifier: quickMod,
          modifiers,
          set: (next) => {
            setQuickOn(next.enabled);
            if (next.modifier) setQuickMod(next.modifier);
          }
        }}
        quickAccessOn={presence.tray && presence.quickAccess}
        conflict={conflict}
        onClearConflict={() => setConflict(false)}
      />
    ),
    presence: (
      <PresencePane
        os={os}
        desktop={desktop}
        available
        settings={presence}
        glyph={scenario.glyph}
        onChange={setPresence}
        onOpenKeys={() => setSection("keys")}
      />
    ),
    data: <DataPane onExport={noop} onImport={noop} onReset={noop} defaultConfirming={scenario.confirming} />
  };

  return (
    <div
      style={{
        width: compact ? 640 : 880,
        height: compact ? 460 : 620,
        border: "1px solid var(--line)",
        borderRadius: 10,
        overflow: "hidden",
        position: "relative"
      }}
    >
      <SettingsShell
        os={os}
        compact={compact}
        section={section}
        onSection={setSection}
        onOpenAppearance={scenario.onOpenAppearance ?? noop}
        query={query}
        onQuery={setQuery}
        version="0.1.15"
        panes={panes}
      />
    </div>
  );
}

type Args = Omit<WindowProps, "os" | "desktop">;
const story = (name: string, args: Args, description?: string): StoryObj => ({
  name,
  parameters: description ? { docs: { description: { story: description } } } : undefined,
  render: (_args, { globals }) => <Window os={platform(globals.os)} desktop={desktopOf(globals)} {...args} />
});

// ---- the seven sections ----

export const General = story("Geral", { section: "general" });

/** Aparência is not a pane: the sidebar item carries a ↗ and its title says it opens in the main window. Clicking it says so here; in the app it raises the main window and runs its existing Aparência stage. */
export const AppearanceLauncher: StoryObj = {
  name: "Aparência · launcher",
  render: function Render(_args, { globals }) {
    const [opened, setOpened] = useState(false);

    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Window
          os={platform(globals.os)}
          desktop={desktopOf(globals)}
          section="general"
          scenario={{ onOpenAppearance: () => setOpened(true) }}
        />
        <span role="status" style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {opened ? "Aparência aberta na janela principal." : "Clique em Aparência ↗: nada muda aqui, a janela principal mostra o palco."}
        </span>
      </div>
    );
  }
};

export const Server_ = story("Servidor", { section: "server" });
export const Explore = story("Explorar", { section: "explore" });
export const Keys = story("Atalhos", { section: "keys", scenario: { quickAccessShortcut: true } });
export const Presence = story(
  "Barra de menus · Bandeja",
  { section: "presence" },
  "Barra de menus on macOS, Bandeja elsewhere; the name beside the icon is macOS's, keep-running is Windows' and Linux's."
);
export const Data = story("Dados e backup", { section: "data" });

// ---- state ----

export const DataConfirm = story("Dados · confirmar restauração", { section: "data", scenario: { confirming: true } });

export const UpdateAvailable = story("Geral · atualização disponível", {
  section: "general",
  scenario: { update: { state: "available", version: "0.2.0" } }
});

export const UpdateUpToDate = story("Geral · na versão mais recente", {
  section: "general",
  scenario: { update: { state: "upToDate" } }
});

export const ServerNone = story("Servidor · nenhum encontrado", { section: "server", scenario: { server: "noServer" } });
export const ServerOffline = story("Servidor · não responde", { section: "server", scenario: { server: "offline" } });
export const ServerBotAway = story("Servidor · bot fora do canal", { section: "server", scenario: { server: "botAway" } });
export const ServerManual = story("Servidor · com um endereço manual", { section: "server", scenario: { server: "manual" } });

export const ExploreNoRegion = story(
  "Explorar · site sem país",
  { section: "explore", scenario: { provider: "soundbuttons" } },
  "The country is dimmed and disabled with its reason when the site has no catalogue by country."
);

export const KeysConflict = story(
  "Atalhos · combinação em uso",
  { section: "keys", scenario: { quickAccessShortcut: false, conflict: true } },
  "Another app already holds the quick access combination: the message stays under it until it is changed."
);

export const PresenceGlyphs = story(
  "Barra de menus · ícone tocando",
  { section: "presence", scenario: { glyph: "playing" } },
  "The preview draws the tray glyph the real icon has: connected, playing, idle (bot out of its channel) or off (no answer)."
);

export const PresenceOff = story(
  "Barra de menus · ícone desligado",
  { section: "presence", scenario: { presence: { tray: false, quickAccess: false } } },
  "Everything that depends on the icon is dimmed, with the reason under it."
);

// ---- search ----

export const SearchResults = story("Busca · resultados", { section: "general", query: "atalho" });
export const SearchAppearance = story("Busca · Aparência ↗", { section: "general", query: "paleta" });
export const SearchEmpty = story("Busca · nada encontrado", { section: "general", query: "zzzz" });

// ---- the minimum window ----

export const Compact = story(
  "Janela mínima · rail de ícones",
  { section: "server", compact: true },
  "640 x 460, under 720: the sidebar is an icon rail, every item keeps its name as a label and a title, and the search moves to the top of the pane."
);

export const CompactSearch = story("Janela mínima · busca", { section: "general", query: "servidor", compact: true });
