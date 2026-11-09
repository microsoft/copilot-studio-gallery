export type GalleryEvent =
  | "gallery_view" | "solution_view" | "contributors_view" | "contributor_profile_view"
  | "solution_click" | "contributors_click" | "contributor_profile_click"
  | "contributor_github_click" | "contributor_filter_click"
  | "contribution_guide_clicked"
  | "trust_acknowledged" | "download_requested"
  | "install_script_copy_clicked" | "install_script_copied" | "install_script_copy_failed";

export interface GalleryContext {
  page_type?: "gallery" | "solution" | "contributors" | "contributor_profile" | "other";
  solution_slug?: string;
  submission_type?: "solution" | "managed-app";
  install_platform?: "macos" | "windows";
  download_surface?: string;
}

export interface ClarityClient {
  (command: "event", event: GalleryEvent): void;
  (command: "set", key: keyof GalleryContext, value: string): void;
}

declare global {
  interface Window {
    clarity?: ClarityClient;
  }
}

export function galleryRoute(pathname: string, base: string): GalleryContext {
  const prefix = base.replace(/\/$/, "");
  if (prefix && pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return { page_type: "other" };
  const path = pathname.slice(prefix.length).replace(/\/$/, "") || "/";
  if (path === "/") return { page_type: "gallery" };
  if (path === "/contributors") return { page_type: "contributors" };
  if (/^\/contributors\/[^/]+$/.test(path)) return { page_type: "contributor_profile" };
  const solution = /^\/solutions\/([a-z0-9-]+)$/.exec(path);
  if (solution) return { page_type: "solution", solution_slug: solution[1] };
  return { page_type: "other" };
}

export function trackGalleryEvent(event: GalleryEvent, context: GalleryContext = {}): void {
  const clarity = typeof window === "undefined" ? undefined : window.clarity;
  // Clarity is intentionally absent in development and may be blocked by the visitor.
  if (!clarity) return;
  for (const key of Object.keys(context) as (keyof GalleryContext)[]) {
    const value = context[key];
    if (value !== undefined) clarity("set", key, value);
  }
  clarity("event", event);
}
