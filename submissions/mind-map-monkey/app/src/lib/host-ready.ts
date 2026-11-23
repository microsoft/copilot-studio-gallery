import { isPreviewMount } from "@/lib/app-view-serializer";
import { STANDALONE } from "@/lib/standalone";

// The published app's hosting runtime injects a bridge (`window.__platformBridge`)
// that the connector client talks through. A call made before that bridge exists
// would silently take the client's authoring fallback and could wait forever, so
// the first connector call waits briefly for the bridge. The design-time preview
// has no bridge by design and never waits.

const BRIDGE_WAIT_MS = 5000;
const POLL_MS = 50;

function hasBridge(): boolean {
  return (window as Window & { __platformBridge?: unknown }).__platformBridge !== undefined;
}

let ready: Promise<void> | null = null;

/** Resolves once the hosting runtime's bridge is present, or after a short bounded wait without it. */
export function whenHostReady(): Promise<void> {
  ready ??= (async () => {
    if (STANDALONE || isPreviewMount(import.meta.env.BASE_URL) || hasBridge()) return;
    const deadline = Date.now() + BRIDGE_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, POLL_MS));
      if (hasBridge()) return;
    }
    console.warn("Mind Map Monkey: the host bridge was not detected; connector calls use the client's default path.");
  })();
  return ready;
}
