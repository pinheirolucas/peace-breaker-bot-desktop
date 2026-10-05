import { useMainPlaybackState } from "../storage";
import type { MainPlayback } from "../storage";

/** The other way to play: what a middle click, Shift + click or Shift + a key does. */
export function otherPlayback(main: MainPlayback): MainPlayback {
  return main === "discord" ? "local" : "discord";
}

/** Where a plain press plays, Discord unless the stored value says "local". An unknown stored value reads as the default. */
export function useMainPlayback(): [MainPlayback, (next: MainPlayback) => void] {
  const [stored, setStored] = useMainPlaybackState("discord");
  return [stored === "local" ? "local" : "discord", setStored];
}
