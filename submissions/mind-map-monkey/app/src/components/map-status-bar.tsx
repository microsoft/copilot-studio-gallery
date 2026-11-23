import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { StatusItem } from "@/components/file-properties";
import { cn } from "@/lib/utils";

// The map's one-line status bar. It never wraps: the facts that do not fit drop out lowest
// priority first, the lead (the file name) truncates last, and whenever anything is hidden or
// cut short the line becomes a button that opens every fact in full.

interface MapStatusBarProps {
  /** Always shown; truncates when even it alone does not fit. */
  lead?: ReactNode;
  /** The lead in full, for the details list. */
  leadDetail?: ReactNode;
  items: StatusItem[];
  className?: string;
}

/** Width kept free for the "show all" mark whenever the line is cut short. */
const MORE_WIDTH = 28;

const separator = (
  <span aria-hidden="true" className="shrink-0 px-1.5">
    ·
  </span>
);

export function MapStatusBar({ lead, leadDetail, items, className }: MapStatusBarProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<ReadonlySet<string> | null>(null);
  const [leadCut, setLeadCut] = useState(false);

  const signature = items.map((item) => item.id).join("|");
  const hasLead = lead !== undefined;
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  });

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const fit = () => {
      const current = itemsRef.current;
      const avail = row.clientWidth;
      const widthOf = (id: string) => (measure.querySelector<HTMLElement>(`[data-status-id="${id}"]`)?.offsetWidth ?? 0);
      const leadWidth = hasLead ? widthOf("__lead") : 0;
      const total = current.reduce((sum, item) => sum + widthOf(item.id), leadWidth);
      if (total <= avail) {
        setShown(new Set(current.map((item) => item.id)));
        setLeadCut(false);
        return;
      }
      let used = leadWidth + MORE_WIDTH;
      const keep = new Set<string>();
      for (const item of [...current].sort((a, b) => a.priority - b.priority)) {
        const width = widthOf(item.id);
        if (used + width > avail) break;
        used += width;
        keep.add(item.id);
      }
      setShown(keep);
      setLeadCut(leadWidth + MORE_WIDTH > avail);
    };
    fit();
    // The observer on the measuring row also catches changes in what the items say.
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [signature, hasLead]);

  const visible = shown ? items.filter((item) => shown.has(item.id)) : items;
  const cut = leadCut || visible.length < items.length;

  const line = (
    <>
      {lead && <span className="flex min-w-0 items-center">{lead}</span>}
      {visible.map((item, index) => (
        <Fragment key={item.id}>
          {(lead || index > 0) && separator}
          <span className="shrink-0">{item.node}</span>
        </Fragment>
      ))}
    </>
  );

  return (
    <div className={cn("relative min-w-0", className)}>
      {/* Every fact at its natural width, off screen, so the line can be fitted without trial renders. */}
      <div ref={measureRef} aria-hidden="true" inert className="pointer-events-none invisible absolute top-0 left-0 flex whitespace-nowrap">
        {lead && (
          <span data-status-id="__lead" className="flex items-center">
            {lead}
          </span>
        )}
        {items.map((item, index) => (
          <span key={item.id} data-status-id={item.id} className="flex">
            {(lead || index > 0) && separator}
            {item.node}
          </span>
        ))}
      </div>
      <div ref={rowRef} className="min-w-0">
        {cut ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full min-w-0 items-center overflow-hidden rounded-sm text-left whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
              >
                {line}
                <span className="ml-auto flex shrink-0 items-center pl-1.5">
                  <Ellipsis aria-hidden="true" className="size-4" />
                  <span className="sr-only">Show all details</span>
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" collisionPadding={8} className="w-auto max-w-[min(24rem,calc(100vw-1rem))] p-3 text-xs">
              <ul className="space-y-1.5 [overflow-wrap:anywhere]">
                {leadDetail && <li className="font-medium text-foreground">{leadDetail}</li>}
                {items.map((item) => (
                  <li key={item.id} className="text-muted-foreground">
                    {item.node}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">{line}</div>
        )}
      </div>
    </div>
  );
}
