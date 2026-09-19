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
 */
export default function OrganizeButton({ blockedReason, onClick }: OrganizeButtonProps) {
  const { t } = useTranslation();
  const blocked = blockedReason !== null;

  const button = (
    <Button
      variant="secondary"
      aria-disabled={blocked || undefined}
      onClick={() => {
        if (!blocked) onClick();
      }}
    >
      <ReorderIcon />
      {t("favorites.organize")}
    </Button>
  );

  return blocked ? <Tooltip label={blockedReason}>{button}</Tooltip> : button;
}
