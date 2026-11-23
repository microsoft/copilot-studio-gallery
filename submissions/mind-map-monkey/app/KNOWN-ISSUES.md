# Known issues

These are the limitations we know about in Mind Map Monkey. None of them stop the app working, but you should know about them before you rely on it, particularly on a shared computer or with maps that other people edit.

## Data and privacy

### Unsaved drafts stay in the browser

A map you haven't saved to OneDrive is kept in the browser's `localStorage` so it survives a refresh. Several other bits of state live there too:

- the draft's name
- the OneDrive folder you last browsed
- a share link waiting to open after sign-in
- the theme and other preferences

Nothing is cleared when you close the tab. On a shared or public computer, the next person to open the app in the same browser profile will see your draft. Save to OneDrive and start a new map, or clear the site data, before you walk away.

## Mermaid export

### Brackets in labels become spaces

Mermaid uses `()`, `[]` and `{}` to mark a node's shape, so there's no safe way to keep them inside a label. When a map is written as Mermaid, each of those characters in a label is replaced with a space, and runs of spaces collapse to one. Leading and trailing quotes and backticks are also stripped. A label such as `Budget (draft)` is saved as `Budget draft`.

Descriptions aren't affected. Put the detail there if the brackets matter.

### The root node's importance isn't saved

The root is always written as a circle, `((label))`, because that's how Mermaid marks the centre of a mind map. Mermaid has no separate way to record importance for the root, so if you mark the root as high or low importance, it goes back to normal the next time the file is opened.

### Older descriptions that start with a backslash

To stop a description line being read back as a directive, a line that starts with `@` or `\` is now written with an extra `\` in front, and one `\` is removed when the file is read. A file saved by an earlier version, with a description line that already started with `\`, loses that first backslash the first time it's opened.

## Saving and sharing

### The save lock is advisory

When two people save the same file, Mind Map Monkey takes a short lock first: it creates a hidden `.<file name>.mindmap-monkey.lock` file next to the map and holds it for up to 120 seconds. That lock has limits:

- It only coordinates Mind Map Monkey sessions. Someone who edits the `.mmd` file in OneDrive, Word, VS Code or anything else ignores it.
- It only applies to files in your own OneDrive. Files shared with you from another person's drive are saved without a lock.
- OneDrive has no conditional write here, so there's still a small window where two saves can race. The app checks for changes before it saves and asks you to merge, but the lock doesn't make the write itself atomic.
- If a browser closes mid-save, the lock file is left behind until its lease runs out.

### A merge can go over the node limit

Maps are limited to 2,000 nodes and 64 levels. Adding, indenting and importing all check those limits, but merging someone else's changes doesn't, so a merged map can briefly go over the node limit. The next save is refused if the file is over 1 MB, and you'll need to trim the map before it saves.

## Editing

### Text is trimmed

Leading and trailing spaces are removed from labels and from each line of a description. Blank lines inside a description are dropped when the map is saved, so paragraphs separated by an empty line come back as consecutive lines.

### Formatting uses the app's own undo

Bold, italic, code and links in descriptions are applied by the app, not the browser's built-in editing commands, which are deprecated. Ctrl+Z and Ctrl+Y use the map's own history, so undo steps back through whole edits rather than single keystrokes inside the description.

### Clipboard and drag-and-drop need permission

Copy, paste and dropping files onto the map rely on the browser's clipboard and file APIs. Some browsers, and some embedded hosts, block these or ask for permission first. If a paste or drop does nothing, use File → Import instead.

## Hosting and layout

### The header setting isn't visible locally

The app is configured to hide the host's header (`showHeader: false` in `ms.config.json`). The local dev player doesn't apply that setting, so you'll still see its bar when running `ms app dev`. It's applied once the app is deployed.

### Leaving with unsaved changes may not warn you

The app asks the browser to warn you before you close the tab with unsaved changes. Browsers only show that prompt if you've interacted with the page, and some hosts that embed the app in a frame suppress it. Save before closing.

### Safe-area insets have no effect yet

The layout pads itself for phone notches and home bars with `env(safe-area-inset-*)`. Those values are always zero unless the page sets `viewport-fit=cover`, and the template's `index.html` is protected, so on phones with a notch the edges of the toolbar can sit close to the screen edge in landscape.

## Not yet tested

- **Large maps.** The 2,000-node limit was chosen to keep files under 1 MB. We haven't measured layout, search or save times at that size.
- **Real touch devices.** The phone layout, including the bottom edit sheet, was tested with an emulated 390 px touch screen, not on physical phones or tablets.
- **Dependency audit.** `bun audit` (November 2026) lists 42 advisories. Most are in build-time tools (Vite, esbuild, PostCSS, minimatch and others) that never reach the published app, or in template libraries the app doesn't import (`xlsx`, `dompurify`). The one that ships is `zod` 4.4.3, pulled in by `@microsoft/managed-apps`, which can use excessive memory validating very large collections. `package.json` is managed by the template, so these are fixed by updating the template rather than the app.
