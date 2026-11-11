/** The license key is unknown, expired or disabled. */
export class InvalidLicenseKeyError extends Error {
  constructor(detail = "The license key is not valid.") {
    super(detail);
    this.name = "InvalidLicenseKeyError";
  }
}

/** The license key is valid but belongs to another store or product. */
export class WrongLicenseProductError extends Error {
  constructor() {
    super("The license key is for another product.");
    this.name = "WrongLicenseProductError";
  }
}

/** The license key is already active on as many computers as it allows. */
export class LicenseActivationLimitError extends Error {
  constructor() {
    super("The license key has reached its activation limit.");
    this.name = "LicenseActivationLimitError";
  }
}

/** The license server could not be reached or answered something unreadable. */
export class LicenseServiceUnavailableError extends Error {
  constructor(detail = "The license server could not be reached.") {
    super(detail);
    this.name = "LicenseServiceUnavailableError";
  }
}

/** Licensing is not configured in this build (no store or product), so keys cannot be activated. */
export class LicensingDisabledError extends Error {
  constructor() {
    super("Licensing is not configured in this build.");
    this.name = "LicensingDisabledError";
  }
}

export interface LicenseActivation {
  /** The id the license server gave this computer; needed to validate and deactivate. */
  readonly instanceId: string;
}

/**
 * Talks to the license server. Failures to reach it reject with `LicenseServiceUnavailableError`;
 * explicit refusals reject with the specific errors above.
 */
export interface LicenseService {
  /** Activates `key` for this computer, named `instanceName`. */
  activate(key: string, instanceName: string): Promise<LicenseActivation>;
  /** Resolves "valid" or "invalid" (expired, disabled, unknown or another product). */
  validate(key: string, instanceId: string): Promise<"valid" | "invalid">;
  /** Frees this computer's activation. Resolves even when the server says the instance no longer exists. */
  deactivate(key: string, instanceId: string): Promise<void>;
}

/** Shows only the last 4 characters of a license key. */
export function maskLicenseKey(key: string): string {
  return `••••${key.slice(-4)}`;
}
