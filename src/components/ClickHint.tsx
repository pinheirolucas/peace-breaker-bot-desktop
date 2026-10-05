import { useTranslation } from "react-i18next";
import type { MainPlayback } from "../storage";
import { Button } from "./Button";
import "./states.css";

export interface ClickHintProps {
  main: MainPlayback;
  /** Opens Configurações › Geral, where the click is set. */
  onChange: () => void;
  onDismiss: () => void;
}

/** Says once what a click on a card does now, and how to play the other way. */
export function ClickHint({ main, onChange, onDismiss }: ClickHintProps) {
  const { t } = useTranslation();
  const discord = main === "discord";

  return (
    <div className="banner" data-tone="info" role="status">
      <span>
        <b>{discord ? t("clickHint.titleDiscord") : t("clickHint.titleLocal")}</b>
        <span>{discord ? t("clickHint.bodyDiscord") : t("clickHint.bodyLocal")}</span>
      </span>
      <span className="bacts">
        <Button variant="ghost" onClick={onChange}>
          {t("clickHint.change")}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          {t("clickHint.dismiss")}
        </Button>
      </span>
    </div>
  );
}
