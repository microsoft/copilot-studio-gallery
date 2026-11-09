import type { HttpSendParams, HttpSendResult } from "@microsoft/managed-apps-common/communication";

type HttpSender = (request: HttpSendParams, timeout: number) => Promise<HttpSendResult>;
export interface PollClock {
  now(): number;
  wait(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

const timeout = 180_000;
const stopped = () => new Error("Stopped waiting locally. The agent may still be running; do not resend the message to retrieve its result.");
const timedOut = () => new Error("The agent did not complete within three minutes. It may still be running; do not resend the message to retrieve its result.");

export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(stopped()); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
    if (signal.aborted) abort();
  });
}

const realClock: PollClock = {
  now: () => Date.now(),
  wait(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(stopped());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, milliseconds);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  },
};

function header(response: HttpSendResult, name: string): string | undefined {
  return Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1];
}

function retryDelay(response: HttpSendResult, now: number): number {
  const value = header(response, "retry-after");
  if (value === undefined) return 15_000;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  if (!Number.isFinite(delay)) throw new Error("The connector returned an invalid Retry-After header; polling stopped.");
  return Math.max(1000, delay);
}

function pollingUrl(location: string, initial: URL, previous?: URL): URL {
  const url = new URL(location, initial);
  const suffix = url.pathname.slice(initial.pathname.length + 1);
  if (url.protocol !== "https:" || url.origin !== initial.origin || url.username || url.password || url.hash
    || !url.pathname.startsWith(`${initial.pathname}/`)
    || !/^[a-z0-9._~-]+$/i.test(suffix)
    || (previous && url.pathname !== previous.pathname)) {
    throw new Error("The connector returned a polling URL outside this agent invocation; polling stopped.");
  }
  return url;
}

export async function completeAgentRequest(
  send: HttpSender, request: HttpSendParams, signal?: AbortSignal, clock: PollClock = realClock,
): Promise<HttpSendResult> {
  if (signal?.aborted) throw stopped();
  const deadline = clock.now() + timeout;
  const remaining = () => {
    if (signal?.aborted) throw stopped();
    const milliseconds = deadline - clock.now();
    if (milliseconds <= 0) throw timedOut();
    return milliseconds;
  };
  let response = await abortable(send(request, remaining()), signal);
  const initial = new URL(request.url);
  if (request.method !== "POST"
    || request.context?.operationName !== "connectorDataOperation.InvokeAgent"
    || request.context.connection?.apiId.split("/").pop()?.toLowerCase() !== "shared_agentnode"
    || !initial.pathname.endsWith("/powerautomate/agentnodes/conversations")) return response;

  let current: URL | undefined;
  while (response.status === 202) {
    const location = header(response, "location");
    // Follow-up polling handles differ from the stable conversation ID.
    if (location !== undefined) current = pollingUrl(location, initial, current);
    if (!current) throw new Error("The agent accepted the message but returned no completion Location. Do not resend it.");
    const delay = retryDelay(response, clock.now());
    if (delay >= remaining()) throw timedOut();
    await clock.wait(delay, signal);
    const headers: Record<string, string> = { Accept: "application/json" };
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      if (["x-ms-protocol-semantics", "servicenamespace", "x-ms-enable-selects"].includes(name.toLowerCase())) {
        headers[name] = value;
      }
    }
    // Keep the entire server-issued URL, including environmentId and opaque goodUntil.
    response = await abortable(send({
      url: current.href,
      method: "GET",
      headers,
      context: { ...request.context, operationName: "connectorDataOperation.GetConversationStatus" },
    }, remaining()), signal);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error("The connector returned an unexpected redirect; completion retrieval stopped.");
  }
  return response;
}
