import { Plus } from "lucide-react";
import { useId } from "react";
import { useT } from "../i18n/I18nProvider";

interface KeyInspectorEmptyProps {
  /** The slot a new key would take (the page's +), or null when the page on screen is full. */
  addSlot: number | null;
  /** Opens the action picker for `addSlot`. */
  onAdd: (slot: number) => void;
}

/** The inspector with no key selected (wide screens): keeps the panel in place and offers to add a key. */
export function KeyInspectorEmpty({ addSlot, onAdd }: KeyInspectorEmptyProps) {
  const t = useT();
  const headingId = useId();
  const reasonId = useId();
  return (
    <aside className="inspector inspector-empty" aria-labelledby={headingId}>
      <div className="inspector-preview inspector-preview-empty" aria-hidden="true">
        <Plus size={48} />
      </div>
      <h2 id={headingId} className="inspector-title">
        {t("inspector.empty.title")}
      </h2>
      <p className="inspector-hint">{t("inspector.empty.hint")}</p>
      <button
        type="button"
        className="button button-primary button-block"
        disabled={addSlot === null}
        aria-describedby={addSlot === null ? reasonId : undefined}
        onClick={() => addSlot !== null && onAdd(addSlot)}
      >
        {t("inspector.empty.add")}
      </button>
      {addSlot === null && (
        <p id={reasonId} className="inspector-hint">
          {t("inspector.empty.pageFull")}
        </p>
      )}
    </aside>
  );
}
