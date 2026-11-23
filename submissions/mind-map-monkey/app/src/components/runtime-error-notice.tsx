import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { ErrorNotice } from "@/components/error-notice";
import { Button } from "@/components/ui/button";
import { technicalDetail } from "@/lib/app-errors";

interface RuntimeFailure {
  detail: string;
  key: number;
}

/** Browser noise that isn't a failure of the app's work. */
function isNoise(message: string, error: unknown): boolean {
  if (/ResizeObserver loop/i.test(message)) return true;
  if (error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError") return true;
  return message === "Script error." && !error;
}

/**
 * Surfaces the app's own unexpected failures — an action that threw, a promise
 * nobody handled — as a notice people can read instead of a console line.
 * Mounted once by the shell; one notice at a time, nothing leaves this frame.
 */
export function RuntimeErrorNotice() {
  const [failure, setFailure] = useState<RuntimeFailure | null>(null);

  useEffect(() => {
    const record = (detail: string) => setFailure((current) => current ?? { detail, key: Date.now() });
    const onError = (event: ErrorEvent) => {
      const error: unknown = event.error;
      if (isNoise(event.message ?? "", error)) return;
      record(technicalDetail(error, event.message));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
      if (isNoise(message, reason)) return;
      record(technicalDetail(reason, "A background task failed."));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!failure) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
      <ErrorNotice
        key={failure.key}
        className="pointer-events-auto w-full max-w-xl shadow-lg"
        title="Something went wrong in the app"
        description="The last action didn't finish. You can keep working and try it again, or reload the app; reloading discards unsaved changes to a OneDrive file."
        details={failure.detail || null}
        actions={
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            <RotateCw aria-hidden="true" />
            Reload app
          </Button>
        }
        onDismiss={() => setFailure(null)}
      />
    </div>
  );
}
