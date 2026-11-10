import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useT } from "../i18n/I18nProvider";

export interface NavItem<Id extends string> {
  id: Id;
  label: string;
  /** Decorative symbol shown next to the label. */
  icon: ReactNode;
}

interface SideNavProps<Id extends string> {
  items: readonly NavItem<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  /** Icons-only rail on wide screens; the labels stay as accessible names and tooltips. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

/**
 * Section navigation: a left sidebar on wide screens and a bottom tab bar on narrow ones
 * (pure CSS), so every section stays one tap away without a drawer to open.
 */
export function SideNav<Id extends string>({ items, active, onSelect, collapsed = false, onCollapsedChange }: SideNavProps<Id>) {
  const t = useT();
  const select = (event: MouseEvent<HTMLAnchorElement>, id: Id) => {
    event.preventDefault();
    onSelect(id);
  };
  return (
    <nav className={collapsed ? "side-nav side-nav-collapsed" : "side-nav"} aria-label={t("nav.label")}>
      {onCollapsedChange && (
        <button
          type="button"
          className="side-nav-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen size={22} aria-hidden="true" /> : <PanelLeftClose size={22} aria-hidden="true" />}
        </button>
      )}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="side-nav-link"
              aria-current={item.id === active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              onClick={(event) => select(event, item.id)}
            >
              <span className="side-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="side-nav-label">{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
