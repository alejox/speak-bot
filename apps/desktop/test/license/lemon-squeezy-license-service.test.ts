import {
  InvalidLicenseKeyError,
  LicenseActivationLimitError,
  LicenseServiceUnavailableError,
  WrongLicenseProductError,
} from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import { LemonSqueezyLicenseService } from "../../src/license/lemon-squeezy-license-service";

const KEY = "38B1460A-5104-4067-A91D-77B872934D51";
const META = { store_id: 11, product_id: 22, product_name: "Remove ads" };

interface Call {
  url: string;
  body: URLSearchParams;
  headers: Record<string, string>;
}

/** A fetch that records requests and answers with the next queued response. */
function fakeFetch(...answers: Array<{ status?: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      body: new URLSearchParams(String(init?.body ?? "")),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    const answer = answers.shift();
    if (!answer) throw new Error("unexpected request");
    if (answer instanceof Error) throw answer;
    const text = typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body);
    return new Response(text, { status: answer.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const service = (fetch: typeof globalThis.fetch) => new LemonSqueezyLicenseService({ storeId: 11, productId: 22, fetch });

describe("LemonSqueezyLicenseService.activate", () => {
  it("posts the key and the computer name and returns the instance id", async () => {
    const { fetch, calls } = fakeFetch({
      body: { activated: true, error: null, license_key: { status: "active" }, instance: { id: "inst-1" }, meta: META },
    });
    await expect(service(fetch).activate(KEY, "Studio Mac")).resolves.toEqual({ instanceId: "inst-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.lemonsqueezy.com/v1/licenses/activate");
    expect(calls[0]!.headers.accept).toBe("application/json");
    expect(calls[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(calls[0]!.body)).toEqual({ license_key: KEY, instance_name: "Studio Mac" });
  });

  it("refuses a key of another product and frees the activation it just used", async () => {
    const { fetch, calls } = fakeFetch(
      { body: { activated: true, error: null, license_key: { status: "active" }, instance: { id: "inst-1" }, meta: { store_id: 11, product_id: 99 } } },
      { body: { deactivated: true, error: null } },
    );
    await expect(service(fetch).activate(KEY, "Mac")).rejects.toBeInstanceOf(WrongLicenseProductError);
    expect(calls[1]!.url).toBe("https://api.lemonsqueezy.com/v1/licenses/deactivate");
    expect(Object.fromEntries(calls[1]!.body)).toEqual({ license_key: KEY, instance_id: "inst-1" });
  });

  it("refuses a key of another store", async () => {
    const { fetch } = fakeFetch(
      { body: { activated: true, error: null, instance: { id: "inst-1" }, meta: { store_id: 5, product_id: 22 } } },
      { body: { deactivated: true, error: null } },
    );
    await expect(service(fetch).activate(KEY, "Mac")).rejects.toBeInstanceOf(WrongLicenseProductError);
  });

  it("reports the activation limit", async () => {
    const { fetch } = fakeFetch({
      status: 400,
      body: { activated: false, error: "This license key has reached the activation limit.", license_key: { status: "active" }, meta: META },
    });
    await expect(service(fetch).activate(KEY, "Mac")).rejects.toBeInstanceOf(LicenseActivationLimitError);
  });

  it("reports an unknown or disabled key as invalid", async () => {
    const { fetch } = fakeFetch({ status: 404, body: { activated: false, error: "license_key not found." } });
    await expect(service(fetch).activate("nope", "Mac")).rejects.toBeInstanceOf(InvalidLicenseKeyError);
  });

  it("reports network failures, server errors and unreadable answers as unavailable", async () => {
    for (const answer of [new TypeError("fetch failed"), { status: 503, body: "busy" }, { status: 200, body: "<html>" }]) {
      const { fetch } = fakeFetch(answer);
      await expect(service(fetch).activate(KEY, "Mac")).rejects.toBeInstanceOf(LicenseServiceUnavailableError);
    }
  });

  it("never puts the key in error messages", async () => {
    const { fetch } = fakeFetch({ status: 400, body: { activated: false, error: `Key ${KEY} is disabled.` } });
    const error = (await service(fetch).activate(KEY, "Mac").catch((caught: unknown) => caught)) as Error;
    expect(error).toBeInstanceOf(InvalidLicenseKeyError);
    expect(error.message).not.toContain(KEY);
  });
});

describe("LemonSqueezyLicenseService.validate", () => {
  it("is valid only when active and for this product", async () => {
    const { fetch, calls } = fakeFetch({ body: { valid: true, error: null, license_key: { status: "active" }, meta: META } });
    await expect(service(fetch).validate(KEY, "inst-1")).resolves.toBe("valid");
    expect(calls[0]!.url).toBe("https://api.lemonsqueezy.com/v1/licenses/validate");
    expect(Object.fromEntries(calls[0]!.body)).toEqual({ license_key: KEY, instance_id: "inst-1" });
  });

  it("is invalid when expired, disabled, unknown or for another product", async () => {
    const answers = [
      { body: { valid: false, error: null, license_key: { status: "expired" }, meta: META } },
      { body: { valid: true, error: null, license_key: { status: "disabled" }, meta: META } },
      { status: 404, body: { valid: false, error: "license_key not found." } },
      { body: { valid: true, error: null, license_key: { status: "active" }, meta: { store_id: 11, product_id: 1 } } },
    ];
    for (const answer of answers) {
      const { fetch } = fakeFetch(answer);
      await expect(service(fetch).validate(KEY, "inst-1")).resolves.toBe("invalid");
    }
  });

  it("rejects as unavailable when the server cannot be reached", async () => {
    const { fetch } = fakeFetch(new TypeError("fetch failed"));
    await expect(service(fetch).validate(KEY, "inst-1")).rejects.toBeInstanceOf(LicenseServiceUnavailableError);
  });
});

describe("LemonSqueezyLicenseService.deactivate", () => {
  it("resolves when deactivated or when the server no longer knows the instance", async () => {
    for (const answer of [{ body: { deactivated: true, error: null } }, { status: 404, body: { deactivated: false, error: "instance not found" } }]) {
      const { fetch } = fakeFetch(answer);
      await expect(service(fetch).deactivate(KEY, "inst-1")).resolves.toBeUndefined();
    }
  });

  it("rejects as unavailable when the server cannot be reached", async () => {
    const { fetch } = fakeFetch(new TypeError("offline"));
    await expect(service(fetch).deactivate(KEY, "inst-1")).rejects.toBeInstanceOf(LicenseServiceUnavailableError);
  });
});
