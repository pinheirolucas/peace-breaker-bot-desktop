import { useTranslation } from "react-i18next";
import { Button } from "./components/Button";
import { Menu, MenuItem, MenuSeparator } from "./components/Menu";
import { ChevronDownIcon, PlusIcon } from "./icons";

export interface AddMenuProps {
  onAdd: () => void;
  onOrganize: () => void;
  onImport: () => void;
  onExport: () => void;
  /** Whether Organizar is worth offering at all. There is nothing to reorder
   *  with no favourites, so then it is left out rather than disabled. */
  canOrganize: boolean;
  /** Why Organizar is unavailable right now, or null when it is. */
  organizeBlockedReason: string | null;
  /** The shortcut that opens the add form, appended to its tooltip. */
  shortcut?: string;
}

/**
 * Adicionar as a split button: the plus adds an instant, the arrow opens the
 * other things that change the list — reorder it, bring one in, take one
 * out. The plus is only an icon at every width, so both halves carry an
 * explicit name.
 *
 * Organizar is disabled rather than hidden while blocked, with the reason
 * under it: a menu item that comes and goes is harder to find than one that
 * says why it cannot be used yet.
 */
export default function AddMenu({
  onAdd,
  onOrganize,
  onImport,
  onExport,
  canOrganize,
  organizeBlockedReason,
  shortcut
}: AddMenuProps) {
  const { t } = useTranslation();
  const addLabel = t("app.add");

  return (
    <div className="split">
      <Button
        className="split__main"
        aria-label={addLabel}
        title={shortcut ? `${addLabel} ${shortcut}` : addLabel}
        onClick={onAdd}
      >
        <PlusIcon size={15} />
      </Button>
      <Menu
        trigger={
          <Button className="split__arrow" aria-label={t("app.addMore")} title={t("app.addMore")}>
            <ChevronDownIcon />
          </Button>
        }
      >
        {canOrganize && (
          <>
            <MenuItem
              primary={t("favorites.organize")}
              secondary={organizeBlockedReason ?? undefined}
              disabled={organizeBlockedReason !== null}
              onSelect={onOrganize}
            />
            <MenuSeparator />
          </>
        )}
        <MenuItem primary={t("app.import")} onSelect={onImport} />
        <MenuItem primary={t("app.export")} onSelect={onExport} />
      </Menu>
    </div>
  );
}
