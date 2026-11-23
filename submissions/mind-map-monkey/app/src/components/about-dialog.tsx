import { useQuery } from "@tanstack/react-query";
import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import appMark64 from "@/assets/app-mark-64.png";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_VERSION, loadHostContext, loadHostUser } from "@/lib/host-info";
import { copyText } from "@/lib/share-link";
import { STANDALONE } from "@/lib/standalone";

interface InfoRow {
  label: string;
  value: string;
  /** IDs and versions read better, and are easier to compare, in a monospaced face. */
  mono?: boolean;
}

interface InfoSection {
  title: string;
  rows: InfoRow[];
}

const STATUS_TEXT = new Set(["Not available in local mode", "Loading…", "Not available", "Not reported"]);

function hostValue<T>(query: { data?: T; isPending: boolean; isError: boolean }, pick: (data: T) => string | undefined): string {
  if (STANDALONE) return "Not available in local mode";
  if (query.isPending) return "Loading…";
  if (query.isError || query.data === undefined) return "Not available";
  return pick(query.data)?.trim() || "Not reported";
}

function browserName(): string {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[] } }).userAgentData?.brands;
  const brand = brands?.find((b) => !/not.a.brand|chromium/i.test(b.brand)) ?? brands?.find((b) => /chromium/i.test(b.brand));
  return brand ? `${brand.brand} ${brand.version}` : navigator.userAgent;
}

/** What the app is, which build is running, and who and where it runs for, with one button to copy it all for a support request. */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const context = useQuery({ queryKey: ["host", "context"], queryFn: loadHostContext, enabled: open && !STANDALONE, retry: false, staleTime: Infinity });
  const user = useQuery({ queryKey: ["host", "user"], queryFn: loadHostUser, enabled: open && !STANDALONE, retry: false, staleTime: Infinity });

  const sections: InfoSection[] = [
    {
      title: "App",
      rows: [
        { label: "Version", value: APP_VERSION, mono: true },
        { label: "Build", value: import.meta.env.MODE, mono: true },
        { label: "App ID", value: hostValue(context, (c) => c.app.appId), mono: true },
        { label: "Environment ID", value: hostValue(context, (c) => c.app.environmentId), mono: true },
        { label: "Session ID", value: hostValue(context, (c) => c.host.sessionId), mono: true },
      ],
    },
    {
      title: "Signed in",
      rows: [
        { label: "Name", value: hostValue(user, (u) => u.fullName) },
        { label: "User object ID", value: hostValue(user, (u) => u.objectId), mono: true },
        { label: "Tenant ID", value: hostValue(user, (u) => u.tenantId), mono: true },
      ],
    },
    {
      title: "Device",
      rows: [
        { label: "Browser", value: browserName() },
        { label: "Language", value: navigator.language },
        { label: "Time zone", value: Intl.DateTimeFormat().resolvedOptions().timeZone },
      ],
    },
  ];

  const copyAll = async () => {
    const text = [
      `Mind Map Monkey ${APP_VERSION}`,
      `Copied: ${new Date().toISOString()}`,
      ...sections.flatMap((section) => ["", `[${section.title}]`, ...section.rows.map((row) => `${row.label}: ${row.value}`)]),
    ].join("\n");
    if (await copyText(text)) toast.success("Copied the About details");
    else toast.error("Couldn't copy: the browser blocked access to the clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-5 sm:max-w-lg max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:content-start max-sm:rounded-none max-sm:border-0 max-sm:p-4 max-sm:pt-[max(1rem,env(safe-area-inset-top))] max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={appMark64} alt="" className="size-10 shrink-0" />
            <DialogHeader className="min-w-0 text-left">
              <DialogTitle>About Mind Map Monkey</DialogTitle>
              <DialogDescription>Version {APP_VERSION}. Include these details when you report a problem.</DialogDescription>
            </DialogHeader>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0 pointer-coarse:size-11" aria-label="Close About">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>

        {sections.map((section) => (
          <section key={section.title} aria-label={section.title} className="space-y-2">
            <h2 className="text-base font-semibold tracking-tight">{section.title}</h2>
            <dl className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
              {section.rows.map((row) => (
                <div key={row.label} className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className={row.mono && !STATUS_TEXT.has(row.value) ? "font-mono text-[0.8125rem] break-all" : "break-words"}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <DialogFooter className="max-sm:mt-auto">
          <Button onClick={() => void copyAll()} className="pointer-coarse:h-11">
            <Copy aria-hidden="true" />
            Copy all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
