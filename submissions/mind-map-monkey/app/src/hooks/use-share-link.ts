import { useCallback, useEffect, useMemo, useState } from "react";
import { useHref } from "react-router-dom";
import type { DriveFileRef } from "@/lib/onedrive-files";
import { buildShareLink, copyText, resolvePublishedAddress } from "@/lib/share-link";
import { useAppStore } from "@/lib/store";

/**
 * The address a share link opens: the user's own choice when set, otherwise the
 * published app's address once the host reports it, otherwise this page's root.
 */
export function useAppAddress() {
  const rootHref = useHref("/");
  const ownAddress = useMemo(() => new URL(rootHref, window.location.href).toString(), [rootHref]);
  const customAddress = useAppStore((s) => s.customAddress);
  const setCustomAddress = useAppStore((s) => s.setCustomAddress);
  const publishedAddress = useAppStore((s) => s.publishedAddress);
  const setPublishedAddress = useAppStore((s) => s.setPublishedAddress);

  useEffect(() => {
    if (publishedAddress !== undefined) return;
    let active = true;
    void resolvePublishedAddress().then((address) => {
      if (active) setPublishedAddress(address);
    });
    return () => {
      active = false;
    };
  }, [publishedAddress, setPublishedAddress]);

  const resolving = publishedAddress === undefined;
  const defaultAddress = resolving ? null : (publishedAddress ?? ownAddress);
  return { address: customAddress ?? defaultAddress, defaultAddress, customAddress, setCustomAddress, resolving };
}

export type ShareStatus = "copied" | "failed" | "pending";

export interface ShareTarget {
  file: DriveFileRef;
  status: ShareStatus;
}

/** Copies a file's share link and reports the outcome for the share dialog to show. */
export function useShareLink() {
  const { address } = useAppAddress();
  const [target, setTarget] = useState<ShareTarget | null>(null);

  const share = useCallback(
    async (file: DriveFileRef) => {
      if (!address) {
        setTarget({ file, status: "pending" });
        return;
      }
      const copied = await copyText(buildShareLink(address, file));
      setTarget({ file, status: copied ? "copied" : "failed" });
    },
    [address],
  );

  const clear = useCallback(() => setTarget(null), []);
  return { share, target, clear };
}
