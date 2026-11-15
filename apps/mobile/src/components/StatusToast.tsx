import { TriangleAlert, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMessageText } from "../i18n/I18nProvider";
import type { Message } from "../i18n/messages";

/** How long a toast stays on screen. */
export const TOAST_MS = 6000;

/** Said with this device's voice because the computer dropped: good to know, not a failure. */
const NOTICE_KEYS: ReadonlySet<string> = new Set(["voice.spokenOnDevice"]);
/** Messages that say something did not happen, besides every `error.*` and `errorCode.*`. */
const FAILURE_KEYS: ReadonlySet<string> = new Set(["key.needsComputer", "multiAction.stepsFailed", "status.loadFailed", "status.boardFull", "ads.store.failed"]);

/**
 * Whether a status message must be seen, not only heard: something the person asked for did not happen, or
 * happened another way. Confirmations ("Key saved.") stay with the status line.
 */
export function needsToast(message: Message | null): message is Message {
  if (!message) return false;
  return message.key.startsWith("error.") || message.key.startsWith("errorCode.") || NOTICE_KEYS.has(message.key) || FAILURE_KEYS.has(message.key);
}

/**
 * A short message over the page, where the status line is kept for screen readers only (a space shows
 * nothing but keys): it floats, so the keys never move, takes no focus and no taps, and goes away by itself.
 * It is for the eye; the status line beside it is what a screen reader hears, once.
 */
export function StatusToast({ message }: { message: Message | null }) {
  const text = useMessageText(message);
  // The message whose time ran out; a new one (even with the same words) shows again.
  const [expired, setExpired] = useState<Message | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setExpired(message), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message || expired === message) return null;
  const isNotice = NOTICE_KEYS.has(message.key);
  const Icon = isNotice ? Volume2 : TriangleAlert;
  return (
    <div className={isNotice ? "toast toast-notice" : "toast toast-failure"} data-testid="toast" aria-hidden="true">
      <Icon size={20} aria-hidden="true" focusable="false" />
      <span>{text}</span>
    </div>
  );
}
