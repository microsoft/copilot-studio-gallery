import { reportPrivateRuntimeError } from "@/lib/console-capture";

// Failure descriptions written for people, not developers. Raw connector
// payloads and stack traces go to private diagnostics, never the parent frame;
// the UI gets what went wrong, which file it concerns, and what to do next.

/** An error the app raised on purpose, whose message is written for the user. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/** A OneDrive operation that failed, explained from the HTTP status the connector reported (when it reported one). */
export class OneDriveError extends Error {
  readonly status: number | undefined;
  /** The operation never answered within the app's bounded wait. */
  readonly timedOut: boolean;

  constructor(action: string, status: number | undefined, options: { reason?: string; timedOut?: boolean } = {}) {
    super(`Couldn't ${action}. ${options.reason ?? reasonFor(status)}`);
    this.name = "OneDriveError";
    this.status = status;
    this.timedOut = options.timedOut ?? false;
  }
}

/** The user stopped waiting for an action. Not a failure to report, just an outcome. */
export class CancelledError extends Error {
  constructor(message = "Cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

/** What a failure notice shows: a headline, plain-language detail, the file involved, and a way to retry. */
export interface FailureInfo {
  title: string;
  description: string;
  /** The file name or path the failure concerns, when known. */
  file: string | null;
  retry?: () => void;
}

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const { status } = error as { status?: unknown };
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) return status;
  }
  return undefined;
}

function codeOf(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const { code } = error as { code?: unknown };
  return typeof code === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(code) ? code : undefined;
}

function reasonFor(status: number | undefined): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You appear to be offline. Reconnect, then try again.";
  switch (status) {
    case 401:
    case 403:
      return "OneDrive refused access: your sign-in may have expired, or the file isn't shared with you. Reopen the app to sign in again, or ask the file's owner for access.";
    case 404:
      return "The file may have been moved, renamed, or deleted.";
    case 409:
    case 412:
    case 423:
      return "The file is locked or was changed elsewhere in the meantime. Wait a moment, then try again.";
    case 413:
      return "The content is larger than OneDrive accepts here.";
    case 429:
      return "OneDrive is busy right now. Wait a moment, then try again.";
    default:
      if (status !== undefined && status >= 500) return "OneDrive isn't responding right now. Try again in a few minutes.";
      return "Check your OneDrive connection, then try again.";
  }
}

/** Describe a failed connector call: raw details stay in private diagnostics; the returned error reads for people. */
export function oneDriveFailure(action: string, error: unknown): OneDriveError {
  reportPrivateRuntimeError(`OneDrive: could not ${action}`, error);
  const status = statusOf(error);
  const code = codeOf(error);
  console.error(`OneDrive: could not ${action}`, {
    ...(status !== undefined ? { status } : {}),
    ...(code !== undefined ? { code } : {}),
  });
  return new OneDriveError(action, status);
}

/**
 * A connector call that never answered. The hosting runtime may be waiting on a
 * sign-in or permission prompt the app cannot see, or the request may have been
 * dropped; either way the user gets the wait back and a way forward.
 */
export function oneDriveTimeout(action: string, waitedMs: number): OneDriveError {
  console.error(`OneDrive: no answer within ${waitedMs} ms while trying to ${action}`);
  const seconds = Math.round(waitedMs / 1000);
  return new OneDriveError(action, undefined, {
    timedOut: true,
    reason: `OneDrive didn't answer within ${seconds} seconds. If a sign-in or permission prompt is waiting elsewhere on the page, complete it, then try again.`,
  });
}

/** True when OneDrive never answered: another attempt would only repeat the wait. */
export function isTimeout(error: unknown): boolean {
  return error instanceof OneDriveError && error.timedOut;
}

/** Retry once, as the app does by default, except after a timeout: waiting the same bound twice helps nobody. */
export function retryUnlessTimedOut(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && !isTimeout(error);
}

/** True when the error's message was written for the user: the app's own throws, including Mermaid parse errors. */
export function isUserFacing(error: unknown): error is Error {
  if (error instanceof OneDriveError || error instanceof UserFacingError) return true;
  return error instanceof Error && Object.getPrototypeOf(error) === Error.prototype && error.message.trim().length > 0;
}

/** One plain sentence for any failure. */
export function describeError(error: unknown, fallback = "Something went wrong. Try again."): string {
  return isUserFacing(error) ? error.message : fallback;
}

const DETAIL_LIMIT = 300;

/** Bounded technical detail of one of the app's own unexpected errors, for a details disclosure inside this frame. */
export function technicalDetail(error: unknown, message?: string): string {
  let text = "";
  if (error instanceof Error) text = error.message ? `${error.name}: ${error.message}` : error.name;
  else if (typeof error === "string") text = error;
  else if (message) text = message;
  else if (error !== undefined && error !== null) {
    try {
      text = JSON.stringify(error);
    } catch {
      text = String(error);
    }
  }
  text = text.trim();
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}…` : text;
}
