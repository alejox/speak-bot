import type { Phrase } from "@speed-deck/core";
import { useEffect, useId, useRef, useState } from "react";
import type { PhraseValues } from "../app/use-phrase-book";
import { useT } from "../i18n/I18nProvider";
import { PhraseEditorDialog } from "./PhraseEditorDialog";
import { RestoreDefaults } from "./RestoreDefaults";

/** Keys per page: 5 × 3 on wide screens, 3 × 5 on narrow ones, 4 columns in the OBS dock. */
export const DECK_PAGE_SIZE = 15;
/** How long a key must be held to open its editor instead of speaking. */
export const LONG_PRESS_MS = 500;

/** Pages needed to show every phrase plus at least one empty key after the last one. */
export function deckPageCount(phrases: readonly Phrase[]): number {
  const highest = phrases.reduce((max, phrase) => Math.max(max, phrase.slot), -1);
  return Math.floor((highest + 1) / DECK_PAGE_SIZE) + 1;
}

interface PhraseDeckProps {
  title: string;
  phrases: Phrase[];
  onSpeak: (phrase: Phrase) => void;
  /** Speaks the editor text; called synchronously inside the tap. */
  onTest: (text: string) => void;
  onAdd: (slot: number, values: PhraseValues) => Promise<boolean>;
  onEdit: (phrase: Phrase, values: PhraseValues) => Promise<boolean>;
  onDelete: (phrase: Phrase) => Promise<boolean>;
  /** Offered in the edit-mode toolbar when given. */
  onRestore?: () => Promise<void>;
  /** "dock" is the compact layout for the OBS dock. */
  variant?: "full" | "dock";
}

/**
 * Stream Deck–style grid of square keys pinned to slots, in pages of 15. Tapping a phrase key speaks it;
 * tapping an empty key, any key in edit mode, a right-click or a long press opens the editor.
 */
export function PhraseDeck({ title, phrases, onSpeak, onTest, onAdd, onEdit, onDelete, onRestore, variant = "full" }: PhraseDeckProps) {
  const t = useT();
  const headingId = useId();
  const [page, setPage] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editorSlot, setEditorSlot] = useState<number | null>(null);
  const keys = useRef(new Map<number, HTMLButtonElement>());
  const lastEditedSlot = useRef<number | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);

  const pageCount = deckPageCount(phrases);
  const current = Math.min(page, pageCount - 1);
  const bySlot = new Map(phrases.map((phrase) => [phrase.slot, phrase]));
  const slots = Array.from({ length: DECK_PAGE_SIZE }, (_, index) => current * DECK_PAGE_SIZE + index);

  // Return focus to the key that opened the editor once it closes.
  useEffect(() => {
    if (editorSlot !== null) {
      lastEditedSlot.current = editorSlot;
      return;
    }
    if (lastEditedSlot.current !== null) keys.current.get(lastEditedSlot.current)?.focus();
    lastEditedSlot.current = null;
  }, [editorSlot]);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const openEditor = (slot: number) => {
    clearTimeout(pressTimer.current);
    setEditorSlot(slot);
  };

  const press = (slot: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const phrase = bySlot.get(slot);
    if (phrase && !isEditing) onSpeak(phrase);
    else openEditor(slot);
  };

  const startLongPress = (slot: number) => {
    clearTimeout(pressTimer.current);
    suppressClick.current = false;
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setEditorSlot(slot);
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => clearTimeout(pressTimer.current);

  const editing = editorSlot === null ? undefined : bySlot.get(editorSlot);

  return (
    <section className={`deck deck-${variant}`} aria-labelledby={headingId}>
      <div className="deck-header">
        <h3 id={headingId}>{title}</h3>
        <button type="button" className="button button-small" aria-pressed={isEditing} onClick={() => setIsEditing((value) => !value)}>
          {isEditing ? t("phrases.done") : t("phrases.edit")}
        </button>
      </div>

      {isEditing && (
        <div className="deck-toolbar">
          <p className="deck-hint">{t("deck.editHint")}</p>
          {onRestore && <RestoreDefaults onRestore={onRestore} />}
        </div>
      )}

      <ol className={`deck-grid${isEditing ? " deck-grid-editing" : ""}`} aria-label={title}>
        {slots.map((slot) => {
          const phrase = bySlot.get(slot);
          const name = phrase
            ? t(isEditing ? "deck.editKey" : "phrases.speakLabel", { text: phrase.text })
            : t("deck.addKey", { number: slot + 1 });
          return (
            <li key={slot}>
              <button
                ref={(element) => {
                  if (element) keys.current.set(slot, element);
                  else keys.current.delete(slot);
                }}
                type="button"
                className={phrase ? "deck-key" : "deck-key deck-key-empty"}
                aria-label={name}
                onClick={() => press(slot)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openEditor(slot);
                }}
                onPointerDown={() => startLongPress(slot)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
              >
                {phrase ? (
                  <span className="deck-key-text">{phrase.label ?? phrase.text}</span>
                ) : (
                  <span className="deck-key-plus" aria-hidden="true">
                    +
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="deck-pager">
        <button
          type="button"
          className="button button-small"
          onClick={() => setPage(current - 1)}
          disabled={current === 0}
          aria-label={t("deck.previous")}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="deck-page" aria-live="polite">
          {t("deck.page", { page: current + 1, count: pageCount })}
        </span>
        <button
          type="button"
          className="button button-small"
          onClick={() => setPage(current + 1)}
          disabled={current >= pageCount - 1}
          aria-label={t("deck.next")}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      {editorSlot !== null && (
        <PhraseEditorDialog
          key={editorSlot}
          slot={editorSlot}
          phrase={editing}
          onSave={(values) => (editing ? onEdit(editing, values) : onAdd(editorSlot, values))}
          onDelete={() => (editing ? onDelete(editing) : Promise.resolve(true))}
          onTest={onTest}
          onClose={() => setEditorSlot(null)}
        />
      )}
    </section>
  );
}
