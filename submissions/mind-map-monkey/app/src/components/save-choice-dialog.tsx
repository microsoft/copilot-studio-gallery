import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type SaveChoice = "save" | "discard" | "cancel";

export interface SaveChoiceOptions {
  title: string;
  description: string;
  /** Label for the save button, e.g. "Save" or "Save…". Leave out when saving isn't possible. */
  saveLabel?: string;
}

interface Pending extends SaveChoiceOptions {
  resolve: (choice: SaveChoice) => void;
}

/**
 * Save, Don't save or Cancel, asked before unsaved work is replaced. `ask` resolves with the choice;
 * render `dialog` once.
 */
export function useSaveChoice() {
  const [pending, setPending] = useState<Pending | null>(null);
  const openRef = useRef(false);

  const ask = useCallback((options: SaveChoiceOptions) => {
    // A second ask while one is open is a cancel, so no promise is left hanging.
    if (openRef.current) return Promise.resolve<SaveChoice>("cancel");
    openRef.current = true;
    return new Promise<SaveChoice>((resolve) => setPending({ ...options, resolve }));
  }, []);

  const settle = (choice: SaveChoice) => {
    openRef.current = false;
    pending?.resolve(choice);
    setPending(null);
  };

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && settle("cancel")}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="[overflow-wrap:anywhere]">{pending?.title}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle("cancel")}>Cancel</AlertDialogCancel>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => settle("discard")}>
            Don&apos;t save
          </Button>
          {pending?.saveLabel && <Button onClick={() => settle("save")}>{pending.saveLabel}</Button>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { ask, dialog };
}
