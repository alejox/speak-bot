import {
  InvalidLicenseKeyError,
  LicenseActivationLimitError,
  LicenseServiceUnavailableError,
  WrongLicenseProductError,
  type LicenseActivation,
  type LicenseService,
} from "@speed-deck/core";

export const LEMON_SQUEEZY_LICENSE_API = "https://api.lemonsqueezy.com/v1/licenses";
const REQUEST_TIMEOUT_MS = 15_000;

export interface LemonSqueezyLicenseServiceOptions {
  storeId: number;
  productId: number;
  /** Defaults to the global fetch; tests inject a fake so they never reach the network. */
  fetch?: typeof globalThis.fetch;
}

type Answer = Record<string, unknown>;

/**
 * The Lemon Squeezy License API (docs.lemonsqueezy.com/api/license-api). It needs no API key; only the
 * license key, the computer name and the instance id are sent. A key is accepted only when the answer
 * names the configured store and product.
 */
export class LemonSqueezyLicenseService implements LicenseService {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: LemonSqueezyLicenseServiceOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async activate(key: string, instanceName: string): Promise<LicenseActivation> {
    const answer = await this.post("activate", { license_key: key, instance_name: instanceName });
    const instanceId = (answer.instance as Answer | undefined)?.id;
    if (answer.activated !== true || typeof instanceId !== "string" || instanceId === "") {
      const error = typeof answer.error === "string" ? answer.error : "";
      if (/activation limit/i.test(error)) throw new LicenseActivationLimitError();
      throw new InvalidLicenseKeyError();
    }
    if (!this.isOurProduct(answer)) {
      // Free the activation the foreign key just used; failing to do so must not hide the real reason.
      await this.deactivate(key, instanceId).catch(() => undefined);
      throw new WrongLicenseProductError();
    }
    return { instanceId };
  }

  async validate(key: string, instanceId: string): Promise<"valid" | "invalid"> {
    const answer = await this.post("validate", { license_key: key, instance_id: instanceId });
    const status = (answer.license_key as Answer | undefined)?.status;
    return answer.valid === true && status === "active" && this.isOurProduct(answer) ? "valid" : "invalid";
  }

  async deactivate(key: string, instanceId: string): Promise<void> {
    // Any readable answer means the server no longer counts this computer (deactivated, or unknown).
    await this.post("deactivate", { license_key: key, instance_id: instanceId });
  }

  private isOurProduct(answer: Answer): boolean {
    const meta = answer.meta as Answer | undefined;
    return meta?.store_id === this.options.storeId && meta?.product_id === this.options.productId;
  }

  /** Posts a form and returns the JSON answer; 4xx answers carry the refusal in the body. */
  private async post(action: string, fields: Record<string, string>): Promise<Answer> {
    let response: Response;
    try {
      response = await this.fetch(`${LEMON_SQUEEZY_LICENSE_API}/${action}`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new LicenseServiceUnavailableError();
    }
    if (response.status >= 500 || response.status === 429) throw new LicenseServiceUnavailableError(`The license server answered ${response.status}.`);
    try {
      const answer = (await response.json()) as unknown;
      if (typeof answer === "object" && answer !== null && !Array.isArray(answer)) return answer as Answer;
    } catch {
      // Falls through: an unreadable answer is treated like no answer.
    }
    throw new LicenseServiceUnavailableError("The license server sent an unreadable answer.");
  }
}
