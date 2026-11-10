import { isServerEvent, type ServerEvent } from "@speed-deck/core";

/** The subset of the browser WebSocket used here, so tests can provide a fake. */
export interface WebSocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((message: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

const OPEN = 1;
const MAX_RETRY_MS = 10_000;

/**
 * Listens to desktop events at `/ws`. Connects on the first subscriber, reconnects with
 * backoff while anyone listens, and disconnects when the last one leaves.
 */
export class DesktopEventSource {
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private socket: WebSocketLike | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 500;

  constructor(
    private readonly createSocket: WebSocketFactory = (url) => new WebSocket(url) as unknown as WebSocketLike,
    private readonly location: Pick<Location, "protocol" | "host"> = window.location,
  ) {}

  get isConnected(): boolean {
    return this.socket?.readyState === OPEN;
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    if (!this.socket && !this.retryTimer) this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.disconnect();
    };
  }

  private connect(): void {
    this.retryTimer = undefined;
    const protocol = this.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = this.createSocket(`${protocol}//${this.location.host}/ws`);
    this.socket = socket;
    socket.onopen = () => {
      this.retryDelay = 500;
    };
    socket.onmessage = (message) => {
      let event: unknown;
      try {
        event = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if (!isServerEvent(event)) return;
      for (const listener of [...this.listeners]) listener(event);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (this.listeners.size === 0) return;
      this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
    };
  }

  private disconnect(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }
}
