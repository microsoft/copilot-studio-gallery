import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { retryUnlessTimedOut } from "@/lib/app-errors";
import { listFolderPage, type DriveItem } from "@/lib/onedrive-files";

/**
 * One page of a OneDrive folder with explicit page-token paging: the visible
 * page's token is state, earlier tokens are remembered so the user can step
 * back, and every page is cached under its own key. Mount it per folder (key
 * the owner on the folder id) so the token trail starts over in a new folder.
 */
export function useFolderPage(folderId: string | null) {
  const [skipToken, setSkipToken] = useState<string | undefined>();
  const [previousTokens, setPreviousTokens] = useState<(string | undefined)[]>([]);

  const query = useQuery({
    queryKey: ["onedrive-folder", folderId, skipToken],
    queryFn: () => listFolderPage(folderId, skipToken),
    retry: retryUnlessTimedOut,
  });

  const items: DriveItem[] = query.data?.items ?? [];
  const nextToken = query.data?.nextToken;

  const showNextPage = () => {
    if (!nextToken || query.isFetching) return;
    setPreviousTokens((tokens) => [...tokens, skipToken]);
    setSkipToken(nextToken);
  };

  const showPreviousPage = () => {
    if (previousTokens.length === 0 || query.isFetching) return;
    setSkipToken(previousTokens[previousTokens.length - 1]);
    setPreviousTokens((tokens) => tokens.slice(0, -1));
  };

  return {
    query,
    items,
    nextToken,
    hasPrevious: previousTokens.length > 0,
    pageNumber: previousTokens.length + 1,
    showNextPage,
    showPreviousPage,
  };
}
