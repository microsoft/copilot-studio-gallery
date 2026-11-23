import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { MotionConfig, motion } from "motion/react";
import appIcon192 from "@/assets/app-icon-192.png";
import appIconDark192 from "@/assets/app-icon-dark-192.png";
import appMark64 from "@/assets/app-mark-64.png";
import { RuntimeErrorNotice } from "@/components/runtime-error-notice";
import { TextMeasurer } from "@/components/text-measurer";
import { Toaster } from "@/components/ui/sonner";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useAppStore } from "@/lib/store";

// Minimal app shell — provides only the layout frame: it owns the single
// `min-h-screen`, mounts the <Toaster/>, and plays a subtle entrance on each
// route. It deliberately ships NO navigation chrome. Decide per app what fits:
//   • a top navbar  → add a sticky <header> above <main> with <Link>s,
//   • a sidebar     → replace <main> with `SidebarInset`; never render both,
//   • or nothing    → single-screen / focused apps often need no nav at all.
// When you add nav, map over `routes` from `@/routes` so route + nav stay in sync.
// Pages fill <main flex-1> with `h-full`; never add `min-h-screen` inside a page.

const DARK_SCHEME = "(prefers-color-scheme: dark)";

/** Points the document's `<link rel=…>` icon at a bundled PNG, adding the element the first time; `media` scopes it to a colour scheme. */
function setDocumentIcon(rel: string, href: string, sizes: string, media = "") {
  const selector = media ? `link[rel="${rel}"][media="${media}"]` : `link[rel="${rel}"]:not([media])`;
  let link = document.head.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    if (media) link.media = media;
    document.head.append(link);
  }
  link.type = "image/png";
  link.setAttribute("sizes", sizes);
  link.href = href;
}

export function AppShell() {
  const { pathname } = useLocation();
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const theme = useAppStore((s) => s.theme);
  const systemDark = useMediaQuery(DARK_SCHEME);
  const dark = theme === "dark" || (theme === "system" && systemDark);
  // Always one of `.dark` / `.light` on <html>: the `dark:` variant keys off the class, and `.light` overrides index.css's OS-dark fallback.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    root.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
  // The Reduce motion setting, not the system one, decides: index.css keys `motion-safe:` / `motion-reduce:` off this attribute.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", reduceMotion);
  }, [reduceMotion]);
  // The browser tab carries the app's name and icon; the scaffold's page template is not the place to set them.
  useEffect(() => {
    document.title = "Mind Map Monkey";
    // The tab shows the bare mark, which reads on light and dark; home-screen icons keep the tiled app icon.
    setDocumentIcon("icon", appMark64, "64x64");
    setDocumentIcon("apple-touch-icon", appIcon192, "192x192");
    // Appended after the default so browsers that honour `media` prefer it in dark mode.
    setDocumentIcon("apple-touch-icon", appIconDark192, "192x192", DARK_SCHEME);
  }, []);
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
    <div className="flex min-h-screen flex-col">
      {/* Before the pages, so its measuring context is registered as early as the commit allows. */}
      <TextMeasurer />
      <main className="flex flex-1 flex-col">
        {/* key on pathname → each route re-mounts and replays the entrance.
            Entrance-only (no AnimatePresence/exit): an exit animation around
            <Outlet/> would animate the NEXT route's content, not the leaving one. */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="flex-1"
        >
          <Outlet />
        </motion.div>
      </main>
      <Toaster theme={dark ? "dark" : "light"} />
      <RuntimeErrorNotice />
    </div>
    </MotionConfig>
  );
}

export default AppShell;
