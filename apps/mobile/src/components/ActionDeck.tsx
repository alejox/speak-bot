import { useId } from "react";

export interface DeckAction {
  id: string;
  /** Decorative glyph shown above the label. */
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Toggle state; omit for plain actions. */
  pressed?: boolean;
  /** Shown under the deck and linked to the key, e.g. why it is disabled. */
  hint?: string;
}

interface ActionDeckProps {
  title: string;
  actions: DeckAction[];
}

/** Fixed, non-editable deck of action keys in the same style as the phrase deck. */
export function ActionDeck({ title, actions }: ActionDeckProps) {
  const headingId = useId();
  const hintPrefix = useId();
  const hints = [...new Set(actions.flatMap((action) => (action.hint ? [action.hint] : [])))];
  const hintId = (hint: string) => `${hintPrefix}-${hints.indexOf(hint)}`;

  return (
    <section className="deck deck-actions" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      <ul className="action-grid">
        {actions.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              className="deck-key action-key"
              onClick={action.onPress}
              disabled={action.disabled}
              aria-pressed={action.pressed}
              aria-describedby={action.hint ? hintId(action.hint) : undefined}
            >
              <span className="action-icon" aria-hidden="true">
                {action.icon}
              </span>
              <span className="action-label">{action.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {hints.map((hint) => (
        <p key={hint} id={hintId(hint)} className="deck-hint">
          {hint}
        </p>
      ))}
    </section>
  );
}
