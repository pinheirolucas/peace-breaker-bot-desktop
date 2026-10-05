import { createContext } from "react";
import type { SnackbarOptions } from "./SnackbarContext";

export interface VoiceApi {
  /** The toast for a play refused because the bot is out of its channel, offering to call it back; null otherwise. */
  botAway: (err: unknown) => SnackbarOptions | null;
  /** The toast for a play refused before asking, because the bot is known to be out of its channel. */
  awayNow: () => SnackbarOptions;
}

const VoiceContext = createContext<VoiceApi>({ botAway: () => null, awayNow: () => ({ message: "" }) });

export default VoiceContext;
