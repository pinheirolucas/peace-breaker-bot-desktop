import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { useServers } from "../hooks/useServers";
import { DEFAULT_PROVIDER_KEY, useProvider } from "../hooks/useProvider";
import { useRegion } from "../hooks/useRegion";
import { isLanguageId } from "../i18n/detect";
import { DEFAULT_REGION, isRegion, regionOptions } from "../regions";
import type { Region } from "../regions";
import type { ProviderInfo } from "../service";
import useProviders from "../useProviders";
import { Group, GroupLabel, PageTitle, PrefRow } from "./Pref";

export interface ExplorePaneProps {
  /** null is unknown — loading, no server, or an old backend — and offers no list to pick from. */
  providers: ProviderInfo[] | null;
  provider: ProviderInfo | null;
  onProvider: (key: string) => void;
  /** Whether the site in use can browse by country. */
  regionSupported: boolean;
  region: Region;
  language: string;
  onRegion: (region: Region) => void;
  onReset: () => void;
}

export function ExplorePane({
  providers,
  provider,
  onProvider,
  regionSupported,
  region,
  language,
  onRegion,
  onReset
}: ExplorePaneProps) {
  const { t } = useTranslation();
  const selectId = useId();
  const regions = useMemo(() => regionOptions(isLanguageId(language) ? language : "en-US"), [language]);
  const changed = (provider !== null && provider.key !== DEFAULT_PROVIDER_KEY) || (regionSupported && region !== DEFAULT_REGION);

  return (
    <>
      <PageTitle title={t("settings.sections.explore")} lede={t("settings.explore.lede")} />

      <GroupLabel>{t("settings.explore.site")}</GroupLabel>
      <Group role="radiogroup" aria-label={t("settings.explore.siteLabel")}>
        {providers && provider ? (
          providers.map((candidate) => {
            const on = candidate.key === provider.key;

            return (
              <button
                key={candidate.key}
                type="button"
                role="radio"
                aria-checked={on}
                className="pick"
                onClick={() => onProvider(candidate.key)}
              >
                <span className="rd" data-state={on ? "checked" : "unchecked"}>
                  {on && <i className="ind" />}
                </span>
                <span className="preftx">
                  <b>{candidate.name}</b>
                </span>
                <span className="tags">
                  {candidate.supportsSearch && <span className="chip">{t("settings.explore.chipSearch")}</span>}
                  {candidate.supportsRegion && <span className="chip">{t("settings.explore.chipRegion")}</span>}
                </span>
              </button>
            );
          })
        ) : (
          <div className="sempty">{t("settings.explore.noProviders")}</div>
        )}
      </Group>

      <GroupLabel>{t("settings.explore.country")}</GroupLabel>
      <Group>
        <PrefRow
          title={t("settings.explore.countryTitle")}
          hint={regionSupported ? t("settings.explore.countryHint") : t("settings.explore.countryOff")}
          dim={!regionSupported}
        >
          <div className="field" style={{ flex: "none", width: 190 }}>
            <label className="sr" htmlFor={selectId}>
              {t("settings.explore.countryTitle")}
            </label>
            <select
              id={selectId}
              value={region}
              disabled={!regionSupported}
              onChange={(event) => {
                if (isRegion(event.target.value)) onRegion(event.target.value);
              }}
            >
              {regions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </PrefRow>
      </Group>

      <div style={{ marginTop: 14 }}>
        <Button variant="ghost" style={{ paddingLeft: 2 }} onClick={onReset} disabled={!changed}>
          {t("filters.reset")}
        </Button>
      </div>
    </>
  );
}

export default function ExploreSection() {
  const { i18n } = useTranslation();
  const { activeUrl } = useServers();
  const providers = useProviders(activeUrl);
  const { provider, setProvider } = useProvider(providers);
  const { region, setRegion } = useRegion();

  return (
    <ExplorePane
      providers={providers}
      provider={provider}
      onProvider={setProvider}
      // Unknown falls through to today's behaviour: the country has always been offered.
      regionSupported={provider ? provider.supportsRegion : true}
      region={region}
      language={i18n.language}
      onRegion={setRegion}
      onReset={() => {
        setProvider(DEFAULT_PROVIDER_KEY);
        setRegion(DEFAULT_REGION);
      }}
    />
  );
}
