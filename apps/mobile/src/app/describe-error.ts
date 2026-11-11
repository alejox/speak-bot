import {
  BoardGridFullError,
  BoardLimitError,
  BoardNotFoundError,
  InvalidBoardError,
  KeyNotFoundError,
  LastBoardError,
  SlotOccupiedError,
  type ApiErrorCode,
} from "@speed-deck/core";
import { DesktopRequestError } from "../adapters/desktop-api";
import type { Message, MessageKey } from "../i18n/messages";

const CODE_MESSAGES: Partial<Record<ApiErrorCode, MessageKey>> = {
  "slot-occupied": "errorCode.slotOccupied",
  "board-limit": "errorCode.boardLimit",
  "grid-full": "errorCode.gridFull",
  "last-board": "errorCode.lastBoard",
  "board-not-found": "errorCode.boardNotFound",
  "key-not-found": "errorCode.keyNotFound",
  "invalid-board": "errorCode.invalidBoard",
  "obs-unavailable": "errorCode.obsUnavailable",
  "obs-disabled": "errorCode.obsDisabled",
  "obs-request-failed": "errorCode.obsRequestFailed",
  "loopback-only": "errorCode.loopbackOnly",
  "nothing-to-repeat": "error.nothingToRepeat",
};

/** Explains a failed board, key, action or OBS request in the interface language, wherever it ran. */
export function describeRequestError(error: unknown): Message {
  if (error instanceof DesktopRequestError) return { key: (error.code && CODE_MESSAGES[error.code]) || "errorCode.failed" };
  if (error instanceof SlotOccupiedError) return { key: "errorCode.slotOccupied" };
  if (error instanceof BoardGridFullError) return { key: "errorCode.gridFull" };
  if (error instanceof BoardLimitError) return { key: "errorCode.boardLimit" };
  if (error instanceof LastBoardError) return { key: "errorCode.lastBoard" };
  if (error instanceof BoardNotFoundError) return { key: "errorCode.boardNotFound" };
  if (error instanceof KeyNotFoundError) return { key: "errorCode.keyNotFound" };
  if (error instanceof InvalidBoardError) return { key: "errorCode.invalidBoard" };
  return { key: "errorCode.failed" };
}
