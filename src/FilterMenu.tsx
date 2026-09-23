import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./components/Button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "./components/Menu";
import { DEFAULT_PROVIDER_KEY } from "./hooks/useProvider";
import { isLanguageId } from "./i18n/detect";
import { CheckIcon, FilterIcon } from "./icons";
import { DEFAULT_REGION, regionOptions } from "./regions";
import type { Region } from "./regions";
import type { ProviderInfo } from "./service";

export interface FilterMenuProps {
  /** null means unknown — still loading, or a backend with no /providers
   *  route — and leaves the site section out rather than guessing at it. */
  providers: ProviderInfo[] | null;
  provider: ProviderInfo | null;
  onProvider: (key: string) => void;
  /** Only some providers can browse by country; see useProviders. */
  regionSupported: boolean;
  region: Region;
  onRegion: (region: Region) => void;
}

/** Whether there is anything to filter by: a known site list, or a site with
 *  a region. */
export function hasFilters({ providers, provider, regionSupported }: FilterMenuProps): boolean {
  return (providers !== null && provider !== null) || regionSupported;
}

function isChanged({ providers, provider, regionSupported, region }: FilterMenuProps): boolean {
  const providerChanged = providers !== null && provider !== null && provider.key !== DEFAULT_PROVIDER_KEY;
  const regionChanged = regionSupported && region !== DEFAULT_REGION;
  return providerChanged || regionChanged;
}

/**
 * The menu's content, on its own: the sites, the regions and the way back to
 * the defaults. FilterMenu wraps it in its icon; on Windows, in a Tight
 * window, the overflow menu carries it inline instead, since the caption
 * buttons leave the toolbar no room for another icon.
 */
export function FilterMenuItems(props: FilterMenuProps) {
  const { providers, provider, onProvider, regionSupported, region, onRegion } = props;
  const { t, i18n } = useTranslation();
  const language = isLanguageId(i18n.language) ? i18n.language : "en-US";

  const regions = useMemo(() => regionOptions(language), [language]);

  const showProviders = providers !== null && provider !== null;

  if (!hasFilters(props)) {
    return null;
  }

  const providerChanged = showProviders && provider.key !== DEFAULT_PROVIDER_KEY;
  const regionChanged = regionSupported && region !== DEFAULT_REGION;

  function reset() {
    if (providerChanged) onProvider(DEFAULT_PROVIDER_KEY);
    if (regionChanged) onRegion(DEFAULT_REGION);
  }

  return (
    <>
      {showProviders && (
        <>
          <MenuLabel>{t("provider.menuLabel")}</MenuLabel>
          {providers.map((candidate) => (
            <MenuItem
              key={candidate.key}
              tick={candidate.key === provider.key ? <CheckIcon /> : null}
              primary={candidate.name}
              closeOnSelect={false}
              onSelect={() => onProvider(candidate.key)}
            />
          ))}
        </>
      )}

      {showProviders && regionSupported && <MenuSeparator />}

      {regionSupported && (
        <>
          <MenuLabel>{t("region.menuLabel")}</MenuLabel>
          {regions.map((option) => (
            <MenuItem
              key={option.value}
              tick={option.value === region ? <CheckIcon /> : null}
              primary={option.label}
              closeOnSelect={false}
              onSelect={() => onRegion(option.value)}
            />
          ))}
        </>
      )}

      {(providerChanged || regionChanged) && (
        <>
          <MenuSeparator />
          <MenuItem primary={t("filters.reset")} closeOnSelect={false} onSelect={reset} />
        </>
      )}
    </>
  );
}

/**
 * What the Explorar tab browses, in one menu: which site, and — for the
 * sites that have one — which country. It stays open between picks, so
 * setting both is one visit, and a dot on the icon says when either differs
 * from the default. The icon has no text, so the name is set explicitly.
 *
 * This replaces ProviderMenu and RegionMenu, which were a chip each in the
 * tools row; a single icon is what fits inside the search capsule.
 */
export default function FilterMenu(props: FilterMenuProps) {
  const { t } = useTranslation();

  if (!hasFilters(props)) {
    return null;
  }

  return (
    <Menu
      className="menu--scroll"
      align="start"
      trigger={
        <IconButton
          label={t("filters.label")}
          className="filter"
          data-changed={isChanged(props) || undefined}
        >
          <FilterIcon />
        </IconButton>
      }
    >
      <FilterMenuItems {...props} />
    </Menu>
  );
}
