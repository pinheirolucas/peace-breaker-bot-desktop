import { useTranslation } from "react-i18next";
import { Menu, MenuItem, MenuLabel } from "./components/Menu";
import { CheckIcon } from "./icons";
import type { ProviderInfo } from "./service";

export interface ProviderMenuProps {
  providers: ProviderInfo[];
  value: string;
  onSelect: (key: string) => void;
}

/**
 * Which site the Explorar tab browses. GET /api/v1/providers is one small,
 * server-owned list — nothing here is discovered or typed in by hand, so
 * unlike ServerMenu there is no add, remove or refresh, just one flat list.
 */
export default function ProviderMenu({ providers, value, onSelect }: ProviderMenuProps) {
  const { t } = useTranslation();
  const current = providers.find((provider) => provider.key === value);

  return (
    <Menu
      trigger={
        <button type="button" className="srv" title={t("provider.switchTitle")}>
          {current?.name ?? value}
        </button>
      }
    >
      <MenuLabel>{t("provider.menuLabel")}</MenuLabel>
      {providers.map((provider) => (
        <MenuItem
          key={provider.key}
          tick={provider.key === value ? <CheckIcon /> : null}
          primary={provider.name}
          onSelect={() => onSelect(provider.key)}
        />
      ))}
    </Menu>
  );
}
