import { DOWNLOAD_COUNTS_URL, downloadCountExplanation, refreshedDownloadCount } from "./download-counts";

const initialized = new WeakSet<HTMLElement>();

export async function refreshDownloadCounts(document: Document, fetcher: typeof fetch = fetch): Promise<void> {
  const elements = [...document.querySelectorAll<HTMLElement>("[data-download-count]")]
    .filter((element) => !initialized.has(element));
  if (!elements.length) return;
  for (const element of elements) initialized.add(element);
  try {
    const response = await fetcher(DOWNLOAD_COUNTS_URL, {
      credentials: "omit", redirect: "error", cache: "no-cache",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Download count request failed (${response.status})`);
    const value: unknown = await response.json();
    for (const element of elements) {
      if (!element.isConnected) continue;
      const { slug, count, asOf, trackedSince } = element.dataset;
      const label = element.querySelector<HTMLElement>("[data-count-label]");
      const explanation = element.querySelector<HTMLElement>("[data-count-explanation]");
      const time = element.querySelector<HTMLTimeElement>("time");
      if (!slug || count === undefined || !asOf || !trackedSince || !label || !explanation || !time) {
        throw new Error("Missing rendered download count configuration");
      }
      const updated = refreshedDownloadCount(value, slug, { count: Number(count), asOf });
      const text = downloadCountExplanation(trackedSince, updated.asOf);
      label.textContent = `${updated.count.toLocaleString("en-US")} ${updated.count === 1 ? "download" : "downloads"}`;
      element.title = text;
      explanation.textContent = text;
      time.dateTime = updated.asOf;
      time.textContent = updated.asOf;
      element.dataset.count = String(updated.count);
      element.dataset.asOf = updated.asOf;
      element.hidden = updated.count === 0;
    }
  } catch (error: unknown) {
    console.error("Gallery download counts failed to refresh; preserving the rendered snapshot:", error instanceof Error ? error.message : String(error));
  }
}
