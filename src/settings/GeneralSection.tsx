import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { SegmentedChoice } from "../components/Segmented";
import { isLanguageId } from "../i18n/detect";
import { clearPersisted, useLanguageChoiceState } from "../storage";
import type { LanguageChoice } from "../storage";
import { PageTitle, Group, GroupLabel, PrefRow } from "./Pref";
import { useUpdateCheck } from "./useUpdateCheck";
import type { UpdateStatus } from "./useUpdateCheck";

export interface GeneralPaneProps {
  language: LanguageChoice;
  onLanguage: (language: LanguageChoice) => void;
  version: string;
  update: UpdateStatus;
  /** False outside Electron, where there is no updater to ask. */
  canCheck: boolean;
  onCheck: () => void;
}

export function GeneralPane({ language, onLanguage, version, update, canCheck, onCheck }: GeneralPaneProps) {
  const { t } = useTranslation();

  const updateHint =
    update.state === "upToDate"
      ? t("settings.general.upToDate")
      : update.state === "available"
        ? t("settings.general.available", { version: update.version })
        : update.state === "failed"
          ? t("settings.general.failed")
          : canCheck
            ? t("settings.general.hourly")
            : t("settings.general.noUpdater");

  return (
    <>
      <PageTitle title={t("settings.sections.general")} lede={t("settings.general.lede")} />

      <GroupLabel>{t("settings.general.language")}</GroupLabel>
      <Group>
        <PrefRow title={t("settings.general.languageTitle")} hint={t("settings.general.languageHint")}>
          <SegmentedChoice
            aria-label={t("settings.general.languageTitle")}
            value={language}
            onChange={onLanguage}
            options={[
              { value: "auto", label: t("settings.general.langAuto") },
              { value: "pt-BR", label: t("settings.general.langPt") },
              { value: "en-US", label: t("settings.general.langEn") }
            ]}
          />
        </PrefRow>
      </Group>

      <GroupLabel>{t("settings.general.updates")}</GroupLabel>
      <Group>
        <PrefRow title={t("settings.general.version", { version })} hint={updateHint}>
          <Button variant="secondary" disabled={!canCheck || update.state === "checking"} onClick={onCheck}>
            {update.state === "checking" ? t("settings.general.checking") : t("settings.general.checkNow")}
          </Button>
        </PrefRow>
      </Group>
    </>
  );
}

export default function GeneralSection() {
  const [stored, setStored] = useLanguageChoiceState("auto");
  const { status, check, available } = useUpdateCheck();
  const language: LanguageChoice = isLanguageId(stored) ? stored : "auto";

  return (
    <GeneralPane
      language={language}
      // "Automático" is a language that was never picked: the key goes, rather than the word being stored.
      onLanguage={(next) => (next === "auto" ? clearPersisted(["language"]) : setStored(next))}
      version={__APP_VERSION__}
      update={status}
      canCheck={available}
      onCheck={check}
    />
  );
}
