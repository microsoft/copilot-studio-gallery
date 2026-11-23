import { useId, type ReactNode } from "react";
import { Monitor, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppStore, type ThemePreference } from "@/lib/store";

const THEME_OPTIONS = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/** Preferences remembered in this browser on this device: a dialog over the editor, full screen on a phone. */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const autoSave = useAppStore((s) => s.autoSave);
  const setAutoSave = useAppStore((s) => s.setAutoSave);
  const autoPan = useAppStore((s) => s.autoPan);
  const setAutoPan = useAppStore((s) => s.setAutoPan);
  const showLinks = useAppStore((s) => s.showLinks);
  const setShowLinks = useAppStore((s) => s.setShowLinks);
  const inspectorPinned = useAppStore((s) => s.inspectorPinned);
  const setInspectorPinned = useAppStore((s) => s.setInspectorPinned);
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const setReduceMotion = useAppStore((s) => s.setReduceMotion);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const themeLabelId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-5 sm:max-w-xl max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:content-start max-sm:rounded-none max-sm:border-0 max-sm:p-4 max-sm:pt-[max(1rem,env(safe-area-inset-top))] max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3">
          <DialogHeader className="min-w-0 text-left">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>These settings are remembered in this browser on this device.</DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0 pointer-coarse:size-11" aria-label="Close settings">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>

        <SettingsGroup title="Appearance">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-4">
            <div className="min-w-48 flex-1 space-y-1">
              <span id={themeLabelId} className="text-sm font-medium">
                Theme
              </span>
              <p id={`${themeLabelId}-description`} className="text-sm text-muted-foreground">
                Follow your device's light or dark setting, or always use one.
              </p>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              value={theme}
              onValueChange={(value) => value && setTheme(value as ThemePreference)}
              aria-labelledby={themeLabelId}
              aria-describedby={`${themeLabelId}-description`}
              className="shrink-0"
            >
              {THEME_OPTIONS.map(({ value, label, Icon }) => (
                <ToggleGroupItem key={value} value={value} className="gap-1.5 pointer-coarse:h-11">
                  <Icon aria-hidden="true" />
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Saving">
          <SettingRow
            label="Auto-save"
            description="Save the open OneDrive map a few seconds after you stop editing. A new map is saved by hand the first time."
            checked={autoSave}
            onChange={setAutoSave}
          />
        </SettingsGroup>

        <SettingsGroup title="Canvas">
          <SettingRow
            label="Pan to the selected node"
            description="When you click or tap a node, move the map so the node and its toolbar are in full view. Turn this off to keep the map still. Keyboard moves and Find still bring a node into view."
            checked={autoPan}
            onChange={setAutoPan}
          />
          <SettingRow
            label="Show links"
            description="Draw the association links between nodes. Hidden links are kept in the map and its Mermaid code."
            checked={showLinks}
            onChange={setShowLinks}
          />
          <SettingRow
            label="Pin the details panel"
            description="On a wide screen, keep the node and link details beside the map. Turn this off to give the map the full width: Edit on the toolbar or a double-click opens the details over the map, and clicking the map closes them."
            checked={inspectorPinned}
            onChange={setInspectorPinned}
          />
          <SettingRow
            label="Reduce motion"
            description="Jump straight to a node instead of gliding, and stop nodes and links from animating."
            checked={reduceMotion}
            onChange={setReduceMotion}
          />
        </SettingsGroup>
      </DialogContent>
    </Dialog>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold tracking-tight">
        {title}
      </h2>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">{children}</div>
    </section>
  );
}

function SettingRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 space-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-description`} className="mt-0.5 shrink-0" />
    </div>
  );
}
