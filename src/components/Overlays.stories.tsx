import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CheckIcon, CloseIcon, ErrorIcon, PlusIcon, RefreshIcon } from "../icons";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { DropZone } from "./DropZone";
import { Field } from "./Field";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "./Menu";
import { RadioGroup } from "./Radio";
import { ServerChip } from "./ServerChip";
import ServerMenuView, { VoiceMenuItem } from "../ServerMenu";
import type { Server } from "../../electron/discovery";
import type { VoiceAction } from "../../electron/presence";
import type { BotStatus } from "../service";
import { Switch } from "./Switch";
import { Toast, ToastProvider } from "./Toast";

const meta: Meta = { title: "Components/Overlays" };
export default meta;

/** Primary sits right on macOS and Linux, left on Windows — switch Sistema
 *  in the toolbar and watch Salvar move. DOM order does not change. */
export const SaveFormFilling: StoryObj = {
  name: "Dialog · SaveForm filling in",
  render: () => (
    <Dialog
      open
      onOpenChange={() => {}}
      title="Adicionar instant"
      description="Cole o link de um som do myinstants.com e dê um nome que você reconheça na grade."
      footer={<><Button variant="secondary">Cancelar</Button><Button>Salvar</Button></>}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Nome" defaultValue="Risada do Ronaldinho" autoFocus />
        <Field label="Link" placeholder="https://www.myinstants.com/pt/instant/…" />
      </div>
    </Dialog>
  )
};

export const SaveFormInvalid: StoryObj = {
  name: "Dialog · SaveForm both invalid",
  render: () => (
    <Dialog
      open
      onOpenChange={() => {}}
      title="Adicionar instant"
      description="Cole o link de um som do myinstants.com e dê um nome que você reconheça na grade."
      footer={<><Button variant="secondary">Cancelar</Button><Button disabled>Salvar</Button></>}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Nome" defaultValue="Ri" error="Use pelo menos 3 caracteres" />
        <Field label="Link" placeholder="Cole o link aqui" error="Link inválido" />
      </div>
    </Dialog>
  )
};

export const AddServerFilling: StoryObj = {
  name: "Dialog · AddServerForm untested",
  render: () => (
    <Dialog
      open
      onOpenChange={() => {}}
      title="Adicionar servidor"
      description="Informe o endereço de um servidor que não foi encontrado automaticamente."
      footer={<><Button variant="secondary">Cancelar</Button><Button disabled>Adicionar</Button></>}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Endereço" placeholder="192.168.1.20:9001" autoFocus />
        <div className="testrow">
          <Button variant="secondary"><RefreshIcon size={14} />Testar conexão</Button>
        </div>
      </div>
    </Dialog>
  )
};

export const AddServerTestFailed: StoryObj = {
  name: "Dialog · AddServerForm test failed",
  render: () => (
    <Dialog
      open
      onOpenChange={() => {}}
      title="Adicionar servidor"
      description="Informe o endereço de um servidor que não foi encontrado automaticamente."
      footer={<><Button variant="secondary">Cancelar</Button><Button disabled>Adicionar</Button></>}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Endereço" defaultValue="servidor-desligado.exemplo.com:9001" />
        <div className="testrow">
          <Button variant="secondary"><RefreshIcon size={14} />Testar conexão</Button>
          <span className="tstatus err"><ErrorIcon size={14} />Não foi possível conectar</span>
        </div>
      </div>
    </Dialog>
  )
};

export const AddServerTested: StoryObj = {
  name: "Dialog · AddServerForm test succeeded",
  render: () => (
    <Dialog
      open
      onOpenChange={() => {}}
      title="Adicionar servidor"
      description="Informe o endereço de um servidor que não foi encontrado automaticamente."
      footer={<><Button variant="secondary">Cancelar</Button><Button>Adicionar</Button></>}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Endereço" defaultValue="bot.exemplo.com:9001" />
        <div className="testrow">
          <Button variant="secondary"><RefreshIcon size={14} />Testar conexão</Button>
          <span className="tstatus ok"><CheckIcon size={14} />Conectado</span>
        </div>
      </div>
    </Dialog>
  )
};

export const ImportFormAccepted: StoryObj = {
  name: "Dialog · ImportForm file accepted",
  render: function Render() {
    const [on, setOn] = useState(true);
    const [keep, setKeep] = useState<"merge" | "replace">("merge");
    return (
      <Dialog
        open
        onOpenChange={() => {}}
        title="Importar instants"
        description="Um arquivo .json gerado pelo Exportar desta app."
        footer={<><Button variant="secondary">Cancelar</Button><Button>Importar</Button></>}
      >
        <DropZone state="ok" title="instants-2026-09-10.json" hint="34 instants no arquivo" />
        <div style={{ marginTop: 16, paddingTop: 15, borderTop: "1px solid var(--line)", display: "grid", gap: 12 }}>
          <Switch label="Instants" checked={on} onCheckedChange={setOn} />
          <RadioGroup
            aria-label="E os que você já tem?"
            value={keep}
            onChange={setKeep}
            options={[
              { value: "merge", label: "Manter os meus" },
              { value: "replace", label: "Substituir tudo" }
            ]}
          />
        </div>
      </Dialog>
    );
  }
};

export const Toasts: StoryObj = {
  render: () => (
    <ToastProvider>
      <Toast open onOpenChange={() => {}} duration={Infinity}
        message="Parece que o instant não existe mais" actionLabel="Remover" onAction={() => {}} />
      <Toast open onOpenChange={() => {}} duration={Infinity}
        message="Não foi possível falar com localhost:9001" actionLabel="Trocar" onAction={() => {}} />
      <Toast open onOpenChange={() => {}} duration={Infinity}
        message="Esse instant já está salvo como “Vish”" />
      <Toast open onOpenChange={() => {}} duration={Infinity}
        message="O bot saiu de #geral. A paz voltou." actionLabel="Desfazer" onAction={() => {}} />
      <Toast open onOpenChange={() => {}} duration={Infinity}
        message="Chamando o bot para #geral…" />
      <Toast open onOpenChange={() => {}} duration={Infinity}
        message="O bot não está em um canal de voz." actionLabel="Chamar para #geral" onAction={() => {}} />
    </ToastProvider>
  )
};

export const ServerMenu: StoryObj = {
  render: () => (
    <Menu open trigger={<ServerChip address="bot.exemplo.com:9001" healthy botStatus={{ connected: false }} />}>
      <div className="mhead">
        Conectado a <b>bot.exemplo.com:9001</b>
        <span className="msub">bot fora de um canal de voz</span>
      </div>
      <VoiceMenuItem voice={{ kind: "none" }} />
      <MenuSeparator />
      <MenuLabel>Rede local</MenuLabel>
      <MenuItem tick={null} primary="192.168.0.12:9001" secondary="macbook · este computador" />
      <MenuItem tick={null} primary="192.168.0.31:9001" secondary="servidor-sala" />
      <MenuSeparator />
      <MenuLabel>Remoto</MenuLabel>
      <MenuItem
        tick={<CheckIcon />}
        primary="bot.exemplo.com:9001"
        trail={<CloseIcon size={12} />}
        trailLabel="Remover bot.exemplo.com:9001"
      />
      <MenuSeparator />
      <MenuItem tick={<PlusIcon />} primary="Adicionar servidor" />
      <MenuSeparator />
      <MenuItem tick={<RefreshIcon />} primary="Procurar novamente" />
    </Menu>
  )
};

/** One flat list, no sections — unlike ServerMenu there is nothing here to
 *  discover or type in by hand, just the small registry GET
 *  /api/v1/providers already gives. */
export const ProviderMenu: StoryObj = {
  render: () => (
    <Menu open trigger={<button type="button" className="srv">MyInstants</button>}>
      <MenuLabel>Site</MenuLabel>
      <MenuItem tick={<CheckIcon />} primary="MyInstants" />
      <MenuItem tick={null} primary="Sound Buttons" />
      <MenuItem tick={null} primary="SoundboardGuy" />
    </Menu>
  )
};

const voiceServers: Server[] = [
  { id: "a", apiUrl: "http://192.168.0.12:9001/api/v1", address: "192.168.0.12", port: 9001, hostname: "macbook", isLocal: true }
];

function VoiceServerMenu({ botStatus, voice }: { botStatus: BotStatus; voice: VoiceAction }) {
  return (
    <ServerMenuView
      servers={voiceServers}
      currentApiUrl="http://192.168.0.12:9001/api/v1"
      healthy
      botStatus={botStatus}
      open
      onOpenChange={() => {}}
      onSelect={() => {}}
      onRefresh={() => {}}
      onAddServer={() => {}}
      onRemoveServer={() => {}}
      voice={voice}
      onLeave={() => {}}
      onRejoin={() => {}}
    />
  );
}

/** The row under the header takes the bot out of the channel the header names. */
export const ServerMenuLeave: StoryObj = {
  name: "Server menu · take the bot out",
  render: () => (
    <VoiceServerMenu
      botStatus={{ connected: true, guildName: "Casa", channelId: "1", channelName: "geral" }}
      voice={{ kind: "leave", channelName: "geral" }}
    />
  )
};

/** With the bot out, the same row calls it back to the last channel the app saw. */
export const ServerMenuRejoin: StoryObj = {
  name: "Server menu · call the bot back",
  render: () => (
    <VoiceServerMenu botStatus={{ connected: false }} voice={{ kind: "rejoin", channelName: "geral", guildName: "Casa" }} />
  )
};

/** Nothing remembered yet: disabled, saying what unblocks it. */
export const ServerMenuNothingRemembered: StoryObj = {
  name: "Server menu · nothing to call back",
  render: () => <VoiceServerMenu botStatus={{ connected: false }} voice={{ kind: "none" }} />
};
