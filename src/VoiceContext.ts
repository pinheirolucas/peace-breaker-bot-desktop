import { createContext } from "react";
import type { SnackbarOptions } from "./SnackbarContext";

export interface VoiceApi {
  /** The toast for a play refused because the bot is out of its channel, offering to call it back; null otherwise. */
  botAway: (err: unknown) => SnackbarOptions | null;
}

const VoiceContext = createContext<VoiceApi>({ botAway: () => null });

export default VoiceContext;
