import OBSWebSocket from "obs-websocket-js";

/** What an obs-websocket client error carries: OBS close codes (e.g. 4009 = authentication failed) or -1/1006 for network errors. */
export interface ObsClientError {
  code?: number;
  message: string;
}

/** The slice of obs-websocket-js the connection manager uses, so tests can provide a fake. */
export interface ObsClient {
  connect(url: string, password?: string): Promise<void>;
  disconnect(): Promise<void>;
  call(requestType: string, requestData?: Record<string, unknown>): Promise<Record<string, unknown>>;
  on(event: string, listener: (data: unknown) => void): void;
}

/** A real obs-websocket v5 client. */
export function createObsWebSocketClient(): ObsClient {
  const obs = new OBSWebSocket();
  return {
    connect: async (url, password) => {
      await obs.connect(url, password);
    },
    disconnect: () => obs.disconnect(),
    call: (requestType, requestData) => obs.call(requestType as never, requestData as never) as Promise<Record<string, unknown>>,
    on: (event, listener) => {
      obs.on(event as never, listener as never);
    },
  };
}
