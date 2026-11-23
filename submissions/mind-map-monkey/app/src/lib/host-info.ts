import { getContext, type IContext } from "@microsoft/managed-apps/app";
import { getUser, type IUser } from "@microsoft/managed-apps/auth";
import { whenHostReady } from "@/lib/host-ready";
import { STANDALONE } from "@/lib/standalone";

/** The app's release version, shown in About. Bump it with each published release. */
export const APP_VERSION = "1.2.1";

const HOST_TIMEOUT_MS = 4000;

/** A host call that waits for the bridge first and gives up after a bounded wait; rejects in local mode, where there is no host. */
async function askHost<T>(call: () => Promise<T>, what: string): Promise<T> {
  if (STANDALONE) throw new Error("Local mode: no hosting runtime");
  await whenHostReady();
  return Promise.race([
    call(),
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error(`${what} timed out`)), HOST_TIMEOUT_MS)),
  ]);
}

let context: Promise<IContext> | null = null;
let user: Promise<IUser> | null = null;

/** The app, environment and session the hosting runtime reports. Cached once it answers; a failure is retried on the next call. */
export function loadHostContext(): Promise<IContext> {
  context ??= askHost(getContext, "App context").catch((error: unknown) => {
    context = null;
    throw error;
  });
  return context;
}

/** The signed-in user the hosting runtime reports. Cached once it answers; a failure is retried on the next call. */
export function loadHostUser(): Promise<IUser> {
  user ??= askHost(getUser, "Signed-in user").catch((error: unknown) => {
    user = null;
    throw error;
  });
  return user;
}
