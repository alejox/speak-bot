import { actionsOf, type Action, type KeyRef } from "@speed-deck/core";
import { useState, type ReactNode } from "react";
import type { ObsLive } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import { ModalDialog } from "./ModalDialog";

/** What a confirmation asks before starting. */
type StartKind = "record" | "stream";

const TEXTS: Readonly<Record<StartKind, { title: MessageKey; confirm: MessageKey }>> = {
  record: { title: "start.recordTitle", confirm: "start.recordYes" },
  stream: { title: "start.streamTitle", confirm: "start.streamYes" },
};

/**
 * Whether running `action` would start a recording or a stream, so it needs a confirmation first.
 * Only the toggles ask, and only while OBS says they are off: stopping never asks, and with no known
 * OBS state the key runs as it always did (those keys are disabled then anyway). A multi-action asks
 * once, before it starts, for the first of its steps that would start something.
 */
export function startToConfirm(action: Action, obs: ObsLive | null): StartKind | null {
  if (!obs || obs.status !== "connected") return null;
  for (const step of actionsOf(action)) {
    if (step.type === "obs.toggleRecord" && !obs.state.recording) return "record";
    if (step.type === "obs.toggleStream" && !obs.state.streaming) return "stream";
  }
  return null;
}

/**
 * Wraps a key runner so starting a recording or a stream asks first. Render `dialog` once, after
 * anything that runs keys (it opens above an open key editor, for its Test button).
 */
export function useConfirmedRun(
  run: ((action: Action, key?: KeyRef) => void) | undefined,
  obs: ObsLive | null,
  statusText = "",
): { run: (action: Action, key?: KeyRef) => void; dialog: ReactNode } {
  const t = useT();
  const [pending, setPending] = useState<{ action: Action; key?: KeyRef; kind: StartKind } | null>(null);

  const guarded = (action: Action, key?: KeyRef) => {
    const kind = startToConfirm(action, obs);
    if (kind) setPending({ action, key, kind });
    else run?.(action, key);
  };

  const dialog = pending && (
    <ModalDialog title={t(TEXTS[pending.kind].title)} onClose={() => setPending(null)} statusText={statusText} className="modal-small">
      <div className="modal-actions">
        <button type="button" className="button" data-autofocus onClick={() => setPending(null)}>
          {t("start.cancel")}
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            setPending(null);
            run?.(pending.action, pending.key);
          }}
        >
          {t(TEXTS[pending.kind].confirm)}
        </button>
      </div>
    </ModalDialog>
  );

  return { run: guarded, dialog };
}
