import { useState } from "react";
import type { ColorMode, ThemeId } from "../themes";
import { useColorMode } from "./useColorMode";
import { useTheme } from "./useTheme";

interface Draft {
  theme: ThemeId;
  mode: ColorMode;
  /** Whether the Aparência shell is the UI reading this draft. The command palette's preview is a draft with no shell. */
  shell: boolean;
}

/**
 * Palette and colour mode, plus the draft of both that a preview works on.
 *
 * While a draft exists every pick is stamped on <html> at once — the whole
 * window, native chrome included, previews it — but nothing is persisted until
 * `commit`. `cancel` just drops the draft, and the stamps fall back to what is
 * stored. That keeps an abandoned choice out of localStorage entirely, so it
 * can never reach another window through the storage event.
 *
 * There is one draft, with two ways in: `begin` opens the Aparência shell on
 * it (`editing`), and `beginPreview` is the command palette's, which draws its
 * own list and shows no shell (`previewing`).
 */
export function useAppearance() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const color = useColorMode(draft?.mode);
  const palette = useTheme(draft?.theme);

  return {
    theme: draft?.theme ?? palette.theme,
    mode: draft?.mode ?? color.mode,
    resolved: color.resolved,
    /** What is saved, as opposed to what a draft is showing: the palette marks the one in use. */
    saved: { theme: palette.theme, mode: color.mode },
    /** The Aparência shell is open. */
    editing: draft?.shell === true,
    /** The palette is previewing: a draft, and no shell. */
    previewing: draft !== null && !draft.shell,
    begin: () => setDraft({ theme: palette.theme, mode: color.mode, shell: true }),
    beginPreview: () =>
      setDraft((current) => current ?? { theme: palette.theme, mode: color.mode, shell: false }),
    preview: (patch: Partial<Pick<Draft, "theme" | "mode">>) =>
      setDraft((current) => current && { ...current, ...patch }),
    cancel: () => setDraft(null),
    /** Saves the draft, or `patch` over it: a caller that previewed and commits in one event has no re-render between them. */
    commit: (patch?: Partial<Pick<Draft, "theme" | "mode">>) => {
      const final = draft || patch ? { theme: palette.theme, mode: color.mode, ...draft, ...patch } : null;

      if (final) {
        palette.setTheme(final.theme);
        color.setMode(final.mode);
      }
      setDraft(null);
    }
  };
}
