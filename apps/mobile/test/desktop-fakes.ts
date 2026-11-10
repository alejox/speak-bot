import type { WebSocketLike } from "../src/adapters/desktop-events";

export interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
}

type Route = (request: RecordedRequest) => { status?: number; body?: unknown } | undefined;

/** A fetch stand-in that records requests and answers from a route function. */
export function createFakeFetch(route: Route) {
  const requests: RecordedRequest[] = [];
  const fetchFn = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const request: RecordedRequest = {
      method: init.method ?? "GET",
      url: String(input),
      body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
    };
    requests.push(request);
    const answer = route(request) ?? { status: 404, body: { error: "Not found." } };
    const status = answer.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(answer.body ?? {}), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fetchFn as typeof fetch, requests };
}

/** A WebSocket stand-in the test drives by hand. */
export class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
}
