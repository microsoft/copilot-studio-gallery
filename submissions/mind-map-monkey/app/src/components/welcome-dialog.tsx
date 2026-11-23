import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import appMark64 from "@/assets/app-mark-64.png?no-inline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { copyText } from "@/lib/share-link";

const SKILL_URL = "https://github.com/scottdurow/mind-map-monkey/tree/main/skills/mind-map-monkey";
const SKILL_ZIP_URL = "https://github.com/scottdurow/mind-map-monkey/raw/refs/heads/main/skills/mind-map-monkey.zip";
const INSTALL_PROMPT = `Please install the Mind Map Monkey personal skill from ${SKILL_ZIP_URL}.

Read SETUP.md in the ZIP and install the complete mind-map-monkey folder into my OneDrive Documents/Cowork/skills/ folder. Ask for my approval if needed. If you cannot access the repository, let me know so I can provide the ZIP.`;

export function WelcomeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const copyPrompt = async () => {
    if (await copyText(INSTALL_PROMPT)) toast.success("Installation prompt copied");
    else toast.error("Couldn't copy the prompt. Select the text and copy it manually.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="pr-6 text-left">
          <div className="mb-1 flex items-center gap-3">
            <img src={appMark64} alt="" className="size-10" />
            <DialogTitle>Welcome to Mind Map Monkey</DialogTitle>
          </div>
          <DialogDescription>
            Create and edit mind maps, or use the Cowork skill to turn your documents and meetings into maps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Install the Cowork skill</h2>
            <p className="text-sm text-muted-foreground">
              Copy this request into a Cowork conversation. You need a OneDrive for Business account.
            </p>
          </div>
          <Label htmlFor="cowork-install-prompt">Request for Cowork</Label>
          <Textarea id="cowork-install-prompt" readOnly value={INSTALL_PROMPT} rows={6} className="resize-y text-sm" />
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={SKILL_ZIP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Download skill ZIP <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
            <a href={SKILL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              View source and setup <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Start mapping</Button>
          <Button onClick={() => void copyPrompt()}>
            <Copy aria-hidden="true" />
            Copy request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
