import { useId, useState, type FormEvent } from "react";
import { useT } from "../i18n/I18nProvider";

interface AddPhraseFormProps {
  /** Resolves true when the phrase was saved, which clears the field. */
  onAdd: (text: string) => Promise<boolean>;
}

export function AddPhraseForm({ onAdd }: AddPhraseFormProps) {
  const t = useT();
  const inputId = useId();
  const [text, setText] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onAdd(text).then((saved) => saved && setText(""));
  };

  return (
    <form className="add-phrase" onSubmit={submit}>
      <label htmlFor={inputId} className="visually-hidden">
        {t("phrases.addLabel")}
      </label>
      <input
        id={inputId}
        className="add-phrase-input"
        value={text}
        placeholder={t("phrases.addPlaceholder")}
        enterKeyHint="done"
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="button button-small button-primary">
        {t("phrases.add")}
      </button>
    </form>
  );
}
