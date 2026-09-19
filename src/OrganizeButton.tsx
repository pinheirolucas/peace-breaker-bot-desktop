import { useTranslation } from "react-i18next";
import { Button } from "./components/Button";
import { Tooltip } from "./components/Tooltip";
import { ReorderIcon } from "./icons";

export interface OrganizeButtonProps {
  /** Why Organizar is unavailable right now, or null when it is. */
  blockedReason: string | null;
  onClick: () => void;
}

/**
 * aria-disabled rather than disabled while blocked: a disabled button gets
 * no hover or focus, so the tooltip saying why could never open.
 *
 * In a Tight window the word is hidden and only the icon shows (shell.css),
 * so the name is set explicitly rather than left to the hidden text.
 */
export default function OrganizeButton({ blockedReason, onClick }: OrganizeButtonProps) {
  const { t } = useTranslation();
  const blocked = blockedReason !== null;

  const button = (
    <Button
      variant="secondary"
      className="btn--organize"
      aria-label={t("favorites.organize")}
      aria-disabled={blocked || undefined}
      onClick={() => {
        if (!blocked) onClick();
      }}
    >
      <ReorderIcon />
      <span className="lbl">{t("favorites.organize")}</span>
    </Button>
  );

  return blocked ? <Tooltip label={blockedReason}>{button}</Tooltip> : button;
}
