/** An application installed on the computer that a deck key can open. */
export interface Application {
  /** What `open` takes; on macOS the absolute path of the `.app` bundle. */
  readonly id: string;
  readonly name: string;
}

/** The id is not one of the applications listed right now, so nothing is opened. */
export class ApplicationNotListedError extends Error {
  constructor() {
    super("That application is not one of the applications of this computer.");
    this.name = "ApplicationNotListedError";
  }
}

/** Opening applications is not available on this operating system. */
export class ApplicationsUnsupportedError extends Error {
  constructor() {
    super("Opening applications is not supported on this system.");
    this.name = "ApplicationsUnsupportedError";
  }
}

/** The system could not open a listed application. */
export class ApplicationOpenFailedError extends Error {
  constructor(detail: string) {
    super(`The application could not be opened: ${detail}`);
    this.name = "ApplicationOpenFailedError";
  }
}

/** Lists the applications of the computer and opens one of them. Nothing else can be opened through it. */
export interface ApplicationLauncher {
  /** The applications found right now, sorted by name. */
  list(): Promise<Application[]>;
  /**
   * Opens the application with this id, or brings it to the front when it is already running. Rejects with
   * `ApplicationNotListedError` unless `id` is exactly the id of a listed application.
   */
  open(id: string): Promise<void>;
}

/** The name an application id shows on a key: its last path segment without `.app`. */
export function applicationNameOf(id: string): string {
  const segment = id.split(/[\\/]/).filter(Boolean).pop() ?? id;
  return segment.replace(/\.app$/i, "") || id;
}
