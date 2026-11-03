export const SITE_ORIGIN = "https://microsoft.github.io";
export const SITE_BASE = "/copilot-studio-gallery";

export function publicAssetPath(path: string): string {
  return `${SITE_BASE}/${path}`;
}
