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
 * Follows a value the desktop pushes with events: `listener` gets each pushed value (what `pick` finds in an
 * event) and, every time the link opens or reopens, a fresh read (`load`), because the events sent while
 * the link was down never arrive. A read that an event overtook is dropped: the event is newer.
 * A read that fails or resolves with null or undefined changes nothing. Returns a function that stops following.
 */
export function followWithReload<T>(
  events: Pick<DesktopEventSource, "subscribe" | "onOpen">,
  pick: (event: ServerEvent) => T | undefined,
  load: () => Promise<T | null | undefined>,
  listener: (value: T) => void,
): () => void {
  let pushed = 0;
  const stopEvents = events.subscribe((event) => {
    const value = pick(event);
    if (value === undefined) return;
    pushed += 1;
    listener(value);
  });
  const stopOpen = events.onOpen(() => {
    const before = pushed;
    load().then(
      (value) => {
        if (value !== null && value !== undefined && pushed === before) listener(value);
      },
      () => undefined,
    );
  });
  return () => {
    stopEvents();
    stopOpen();
  };
}

/**
 * Listens to desktop events at `/ws`. Connects on the first subscriber, reconnects with
 * backoff while anyone listens, and disconnects when the last one leaves.
 */
export class DesktopEventSource {
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private readonly connectionListeners = new Set<(connected: boolean) => void>();
  private readonly openListeners = new Set<() => void>();
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

  /**
   * Reports each time the link opens (true) or closes (false, also when an attempt to reconnect fails),
   * and keeps it open while watched. Returns a function that stops watching.
   */
  watchConnection(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    const unsubscribe = this.subscribe(() => {});
    return () => {
      this.connectionListeners.delete(listener);
      unsubscribe();
    };
  }

  /**
   * Runs `listener` each time the link opens: the first time and after every reconnection. Events sent
   * while the link was down are gone for good, so whatever events keep up to date has to be read again
   * then. It does not open the link by itself; returns a function that stops listening.
   */
  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private reportConnection(connected: boolean): void {
    for (const listener of [...this.connectionListeners]) listener(connected);
    if (connected) for (const listener of [...this.openListeners]) listener();
  }

  private connect(): void {
    this.retryTimer = undefined;
    const protocol = this.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = this.createSocket(`${protocol}//${this.location.host}/ws`);
    this.socket = socket;
    socket.onopen = () => {
      this.retryDelay = 500;
      this.reportConnection(true);
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
      this.reportConnection(false);
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
