import { Check, Pencil } from "lucide-react";
import { useT } from "../i18n/I18nProvider";

interface EditKeysToggleProps {
  isEditing: boolean;
  onChange: (isEditing: boolean) => void;
}

/**
 * Presentational: the toggle that brings out the Deck's editing tools on a phone (add, grid size, key menus,
 * moving keys) and puts them away again. Its name stays the same; aria-pressed tells whether editing is on.
 */
export function EditKeysToggle({ isEditing, onChange }: EditKeysToggleProps) {
  const t = useT();
  const Icon = isEditing ? Check : Pencil;
  return (
    <button
      type="button"
      className="icon-button edit-keys-toggle"
      aria-label={t("deck.editKeys")}
      aria-pressed={isEditing}
      title={t("deck.editKeys")}
      onClick={() => onChange(!isEditing)}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}
