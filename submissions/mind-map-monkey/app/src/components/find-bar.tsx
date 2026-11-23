import { useId, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown, ChevronUp, Search, Tag, UnfoldVertical, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EMPTY_QUERY, isSearchActive, type SearchQuery, type TagCount } from "@/lib/mindmap-search";

interface FindBarProps {
  query: SearchQuery;
  onQueryChange: (query: SearchQuery) => void;
  /** Every tag in the map with its node count, for the tag picker. */
  tags: TagCount[];
  matchCount: number;
  /** 1-based place of the current match among the matches; 0 when no match is current. */
  position: number;
  /** The current match's label, read out with the count; null when no match is current. */
  currentLabel: string | null;
  /** Matches inside collapsed branches, which the canvas does not show. */
  hiddenCount: number;
  onNext: () => void;
  onPrevious: () => void;
  onExpandHidden: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The find bar above the canvas: text (with `#tag` words), a tag picker, the selected tags, how many
 * nodes match, and Previous / Next to step through them. Enter steps forward, Shift+Enter back, Escape
 * closes the bar — which also clears the filter, so nothing stays dimmed out of sight.
 */
export function FindBar({
  query,
  onQueryChange,
  tags,
  matchCount,
  position,
  currentLabel,
  hiddenCount,
  onNext,
  onPrevious,
  onExpandHidden,
  onClose,
  inputRef,
}: FindBarProps) {
  const uid = useId();
  const inputId = `${uid}-text`;
  const statusId = `${uid}-status`;
  const pickerHeadingId = `${uid}-tags-heading`;
  const active = isSearchActive(query);

  const status = !active
    ? ""
    : matchCount === 0
      ? "No matches"
      : `${position > 0 ? `${position} of ` : ""}${matchCount} ${matchCount === 1 ? "match" : "matches"}${
          hiddenCount > 0 ? `, ${hiddenCount} in collapsed ${hiddenCount === 1 ? "branch" : "branches"}` : ""
        }`;

  const setTag = (tag: string, on: boolean) =>
    onQueryChange({ ...query, tags: on ? [...new Set([...query.tags, tag])].sort() : query.tags.filter((entry) => entry !== tag) });

  const clear = () => {
    onQueryChange(EMPTY_QUERY);
    inputRef.current?.focus();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div role="search" aria-label="Find nodes" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-card px-3 py-1.5">
      <Label htmlFor={inputId} className="text-xs">
        Find
      </Label>
      <div className="relative min-w-0 flex-1 basis-44">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          ref={inputRef}
          type="text"
          value={query.text}
          onChange={(event) => onQueryChange({ ...query, text: event.target.value })}
          onKeyDown={onInputKeyDown}
          placeholder="Text or #tag"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={statusId}
          className="h-8 pl-8 text-sm"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8" aria-label={`Tags${query.tags.length ? `, ${query.tags.length} selected` : ""}`}>
            <Tag aria-hidden="true" />
            Tags
            {query.tags.length > 0 && (
              <Badge variant="secondary" aria-hidden="true" className="h-5 min-w-5 px-1.5 tabular-nums">
                {query.tags.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          {tags.length === 0 ? (
            <p className="px-1.5 py-2 text-sm text-muted-foreground">No tags in this map yet. Add tags to a node in the inspector.</p>
          ) : (
            <>
              <p id={pickerHeadingId} className="px-1.5 pb-1.5 text-xs text-muted-foreground">
                Matches carry every selected tag.
              </p>
              <ul aria-labelledby={pickerHeadingId} className="max-h-64 space-y-0.5 overflow-y-auto">
                {tags.map(({ tag, count }, index) => {
                  const id = `${uid}-tag-${index}`;
                  return (
                    <li key={tag} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/60">
                      <Checkbox id={id} checked={query.tags.includes(tag)} onCheckedChange={(checked) => setTag(tag, checked === true)} />
                      <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer justify-between gap-2 font-normal [overflow-wrap:anywhere]">
                        <span>#{tag}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </PopoverContent>
      </Popover>

      {query.tags.length > 0 && (
        <ul aria-label="Selected tags" className="flex flex-wrap items-center gap-1">
          {query.tags.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted py-0.5 pr-0.5 pl-2 text-xs text-foreground">
              <span className="[overflow-wrap:anywhere]">#{tag}</span>
              <button
                type="button"
                aria-label={`Remove tag ${tag} from the filter`}
                onClick={() => setTag(tag, false)}
                className="grid size-5 place-items-center rounded-full hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p id={statusId} role="status" aria-live="polite" className="min-w-0 text-xs tabular-nums text-muted-foreground [overflow-wrap:anywhere]">
        {status}
        {status && position > 0 && currentLabel !== null && <span className="sr-only">: {currentLabel}</span>}
      </p>

      <div role="group" aria-label="Move between matches" className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label="Previous match" aria-keyshortcuts="Shift+Enter" onClick={onPrevious} disabled={matchCount === 0}>
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next match" aria-keyshortcuts="Enter" onClick={onNext} disabled={matchCount === 0}>
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>

      {hiddenCount > 0 && (
        <Button variant="outline" size="sm" className="h-7" onClick={onExpandHidden}>
          <UnfoldVertical aria-hidden="true" />
          Expand {hiddenCount} hidden
        </Button>
      )}

      {active && (
        <Button variant="ghost" size="sm" className="h-7" onClick={clear}>
          <X aria-hidden="true" />
          Clear
        </Button>
      )}

      <Button variant="ghost" size="icon-sm" aria-label="Close find bar" onClick={onClose} className="ml-auto">
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
