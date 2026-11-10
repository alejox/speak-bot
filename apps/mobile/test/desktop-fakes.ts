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

/** A phrase as the old phrase deck sees it: a speak key on the first desktop board. */
export interface FakePhrase {
  text: string;
  label?: string;
  slot: number;
}

/** A GET /api/boards body: one communication board whose speak keys are `phrases` (other phrase fields are ignored). */
export function boardsOf<T extends FakePhrase>(phrases: readonly T[]) {
  return [
    {
      id: "communication",
      name: "Comunicación",
      kind: "voice",
      columns: 5,
      rows: 3,
      keys: phrases.map(({ text, label, slot }) => ({ slot, ...(label ? { label } : {}), action: { type: "voice.speak", text } })),
    },
  ];
}

/** The phrase a `PUT /api/boards/communication/keys/:slot` request stores, or null for other requests. */
export function phraseFromKeyRequest(request: RecordedRequest): FakePhrase | null {
  const match = /^\/api\/boards\/communication\/keys\/(\d+)$/.exec(request.url);
  if (request.method !== "PUT" || !match) return null;
  const body = request.body as { label?: string; action: { text: string } };
  return { slot: Number(match[1]), text: body.action.text, ...(body.label ? { label: body.label } : {}) };
}
