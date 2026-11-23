import type { MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { editorPath } from "@/lib/share-link";
import { useAppStore } from "@/lib/store";
import { routes } from "@/routes";

export type BeforeNavigate = (to: string) => Promise<boolean> | boolean;

export interface PageLink {
  path: string;
  to: string;
  label: string;
  Icon?: LucideIcon;
  current: boolean;
  /** Plain clicks go through `beforeNavigate` first; modifier and middle clicks open a new tab untouched. */
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/** The route table's labelled entries as links, for a nav bar or a menu alike. */
export function usePageLinks(beforeNavigate?: BeforeNavigate): PageLink[] {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentFile = useAppStore((s) => s.currentFile);

  return routes
    .filter((route) => route.label)
    .map((route) => {
      const current = route.path === pathname;
      const to = route.path === "/" ? editorPath(currentFile) : route.path;
      return {
        path: route.path,
        to,
        label: route.label as string,
        Icon: route.icon,
        current,
        onClick: (event) => {
          if (current || !beforeNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          void Promise.resolve(beforeNavigate(to)).then((ok) => {
            if (ok) void navigate(to);
          });
        },
      };
    });
}
