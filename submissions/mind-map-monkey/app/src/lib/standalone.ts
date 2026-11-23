// Local standalone mode: the dev build opened directly at http://localhost:5173/?standalone,
// outside the Copilot Managed Runtime host. There is no host bridge, so OneDrive isn't
// available: connector calls fail straight away with a clear message instead of waiting
// for a host that will never answer. Everything else (editing, layout, import/export,
// undo, the inspector) works as normal, so the app can be driven end to end in a browser.
//
// Opt-in only: `?standalone` turns it on for the tab (kept in sessionStorage so in-app
// navigation that drops the query keeps it), `?standalone=0` turns it off. Production
// builds and non-localhost addresses never enter it.

const KEY = "mindmap-monkey.standalone";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function detect(): boolean {
  if (!import.meta.env.DEV || !LOCAL_HOSTS.has(window.location.hostname)) return false;
  const param = new URLSearchParams(window.location.search).get("standalone");
  const on = param !== null && param !== "0" && param !== "false";
  try {
    if (param !== null) {
      if (on) sessionStorage.setItem(KEY, "1");
      else sessionStorage.removeItem(KEY);
      return on;
    }
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return on;
  }
}

export const STANDALONE: boolean = detect();

export const STANDALONE_NOTICE = "Local mode: OneDrive is off";

export function standaloneMessage(action: string): string {
  return `OneDrive isn't connected in local mode, so the app can't ${action}. Run the app through ms app dev to use OneDrive.`;
}
