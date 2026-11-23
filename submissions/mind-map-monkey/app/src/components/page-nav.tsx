import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePageLinks, type BeforeNavigate } from "@/hooks/use-page-links";
import { cn } from "@/lib/utils";

/**
 * Top-level page switcher, built from the route table's labelled entries.
 * `beforeNavigate` lets a page with unsaved work ask first.
 */
export function PageNav({ beforeNavigate, className }: { beforeNavigate?: BeforeNavigate; className?: string }) {
  const links = usePageLinks(beforeNavigate);

  return (
    <nav aria-label="Pages" className={className}>
      <ul className="flex items-center gap-0.5">
        {links.map(({ path, to, label, Icon, current, onClick }) => (
          <li key={path}>
            <Button asChild variant="ghost" size="sm" className={cn("h-8", current && "bg-muted font-semibold hover:bg-muted")}>
              <Link to={to} aria-current={current ? "page" : undefined} onClick={onClick}>
                {Icon && <Icon aria-hidden="true" />}
                {label}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
