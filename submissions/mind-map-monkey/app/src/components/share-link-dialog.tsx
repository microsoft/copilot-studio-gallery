import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppAddress, type ShareStatus, type ShareTarget } from "@/hooks/use-share-link";
import { buildShareLink, copyText, hostOf, normalizeAddress } from "@/lib/share-link";
import { cn } from "@/lib/utils";

export function ShareLinkDialog({ target, onClose }: { target: ShareTarget | null; onClose: () => void }) {
  const { address, defaultAddress, customAddress, setCustomAddress, resolving } = useAppAddress();
  const [status, setStatus] = useState<ShareStatus>("pending");
  const [addressInput, setAddressInput] = useState("");
  const [addressError, setAddressError] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);

  useEffect(() => {
    if (!target) return;
    setStatus(target.status);
    setAddressError(false);
    setAddressOpen(false);
  }, [target]);

  useEffect(() => {
    setAddressInput(address ?? "");
  }, [address]);

  const link = target && address ? buildShareLink(address, target.file) : "";

  const copy = async () => {
    if (!link) return;
    setStatus((await copyText(link)) ? "copied" : "failed");
  };

  const commitAddress = () => {
    const normalized = normalizeAddress(addressInput);
    if (!normalized) {
      setAddressError(true);
      return;
    }
    setAddressError(false);
    setCustomAddress(normalized === defaultAddress ? null : normalized);
    setStatus("pending");
  };

  const useDefault = () => {
    setCustomAddress(null);
    setAddressError(false);
    setStatus("pending");
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{status === "copied" ? "Link copied" : "Copy link"}</DialogTitle>
          <DialogDescription>
            Opens {target?.file.name ?? "this map"} in this app for anyone who can use the app and has access to the file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="share-link">Link</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="share-link"
              readOnly
              value={link}
              placeholder={resolving ? "Looking up the app address…" : ""}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button onClick={() => void copy()} disabled={!link}>
              {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {status === "copied" ? "Copied" : "Copy"}
            </Button>
          </div>
          <p role="status" className={cn("text-xs", status === "failed" ? "text-destructive" : "text-muted-foreground")}>
            {status === "copied" && "The link is on your clipboard."}
            {status === "failed" && "Copying is blocked here. Select the link and copy it manually."}
            {status === "pending" && resolving && (
              <span className="flex items-center gap-1.5">
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                Looking up the app address…
              </span>
            )}
          </p>
        </div>

        <Collapsible open={addressOpen} onOpenChange={setAddressOpen} className="rounded-md border border-border">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="h-auto w-full justify-between gap-2 whitespace-normal px-3 py-2 text-left font-normal">
              <span className="min-w-0 break-all">
                App address: <span className="font-medium">{address ? hostOf(address) : "…"}</span>
                {customAddress && <span className="text-muted-foreground"> (custom)</span>}
              </span>
              <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform", addressOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 border-t border-border p-3">
            <Label htmlFor="app-address">Address the link opens</Label>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                commitAddress();
              }}
            >
              <Input
                id="app-address"
                value={addressInput}
                onChange={(event) => setAddressInput(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={addressError || undefined}
                aria-describedby={addressError ? "app-address-error app-address-help" : "app-address-help"}
                className="min-w-0 flex-1 font-mono text-xs"
              />
              <Button type="submit" variant="secondary" disabled={!addressInput.trim()}>
                Use this address
              </Button>
              {customAddress && (
                <Button type="button" variant="outline" onClick={useDefault}>
                  Use default
                </Button>
              )}
            </form>
            {addressError && (
              <p id="app-address-error" role="alert" className="text-xs text-destructive">
                Enter a full address starting with https://
              </p>
            )}
            <p id="app-address-help" className="text-xs text-muted-foreground">
              Change this if the copied link doesn't open the app where your collaborators use it. The address is remembered in this browser.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
