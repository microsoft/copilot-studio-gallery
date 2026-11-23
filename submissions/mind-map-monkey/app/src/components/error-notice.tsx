import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, CircleAlert, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ErrorNoticeProps {
  title: string;
  /** What went wrong and what to do, in plain language. */
  description?: string | null;
  /** The file name or path the failure concerns. */
  file?: string | null;
  /** Bounded technical detail, offered behind a toggle. */
  details?: string | null;
  /** Runs the failed action again; the notice hands focus back before it goes away. */
  onRetry?: () => void;
  retryLabel?: string;
  /** The action is already running again: Try again pauses meanwhile. */
  busy?: boolean;
  /** Further ways out, such as Open from OneDrive. */
  actions?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/**
 * A failure that stays on screen until acted on: announced on arrival, focused so
 * keyboard and screen-reader users land on it, dismissed with Escape or its
 * button. Focus returns to where it was once the notice goes away.
 */
export function ErrorNotice({ title, description, file, details, onRetry, retryLabel = "Try again", busy = false, actions, onDismiss, className }: ErrorNoticeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  useEffect(() => {
    if (document.activeElement !== ref.current) returnTo.current = document.activeElement;
    ref.current?.focus();
  }, []);

  /** Leave the notice: focus goes back to where it was, then the caller removes it. */
  const leave = (then: () => void) => {
    const target = returnTo.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    then();
  };

  const dismiss = () => {
    if (onDismiss) leave(onDismiss);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && onDismiss) {
      event.stopPropagation();
      dismiss();
    }
  };

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "rounded-lg border border-destructive/40 bg-card p-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring forced-colors:border-[CanvasText]",
        className,
      )}
    >
      <div className="flex gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p id={titleId} className="font-medium text-destructive">
            {title}
          </p>
          {file && <p className="break-all font-mono text-xs text-foreground">{file}</p>}
          {description && (
            <p id={descriptionId} className="text-foreground">
              {description}
            </p>
          )}
          {details && (
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="link" size="sm" className="h-auto px-0 py-0 text-xs text-muted-foreground">
                  {detailsOpen ? "Hide details" : "Show details"}
                  <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform", detailsOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-1 rounded-md border border-border bg-muted/50 p-2 font-mono text-xs break-words whitespace-pre-wrap text-foreground">{details}</pre>
              </CollapsibleContent>
            </Collapsible>
          )}
          {(onRetry || actions || onDismiss) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {onRetry && (
                <Button size="sm" disabled={busy} onClick={() => leave(onRetry)}>
                  <RotateCw aria-hidden="true" />
                  {retryLabel}
                </Button>
              )}
              {actions}
              {onDismiss && (
                <Button variant="ghost" size="sm" onClick={dismiss}>
                  Dismiss
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
