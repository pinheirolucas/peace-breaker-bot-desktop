import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { Group, GroupLabel, PageTitle, PrefRow } from "./Pref";

export interface DataPaneProps {
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  /** Starts on the question, for a story or a test that is about it. */
  defaultConfirming?: boolean;
}

export function DataPane({ onExport, onImport, onReset, defaultConfirming = false }: DataPaneProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(defaultConfirming);

  return (
    <>
      <PageTitle title={t("settings.sections.data")} lede={t("settings.data.lede")} />

      <GroupLabel>{t("settings.data.favorites")}</GroupLabel>
      <Group>
        <PrefRow title={t("app.export")} hint={t("settings.data.exportHint")}>
          <Button variant="secondary" onClick={onExport}>
            {t("settings.data.exportAction")}
          </Button>
        </PrefRow>
        <PrefRow title={t("app.import")} hint={t("settings.data.importHint")}>
          <Button variant="secondary" onClick={onImport}>
            {t("settings.data.importAction")}
          </Button>
        </PrefRow>
      </Group>

      <GroupLabel>{t("settings.data.restore")}</GroupLabel>
      <Group>
        {confirming ? (
          <div className="prefrow" role="alertdialog" aria-label={t("settings.data.confirmLabel")}>
            <div className="preftx">
              <b>{t("settings.data.confirmTitle")}</b>
              <span>{t("settings.data.confirmBody")}</span>
            </div>
            <div className="sdf">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  onReset();
                }}
              >
                {t("settings.data.confirmAction")}
              </Button>
            </div>
          </div>
        ) : (
          <PrefRow title={t("settings.data.resetTitle")} hint={t("settings.data.resetHint")}>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              {t("settings.data.resetAction")}
            </Button>
          </PrefRow>
        )}
      </Group>
    </>
  );
}
