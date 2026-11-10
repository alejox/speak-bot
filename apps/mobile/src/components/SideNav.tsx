import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useT } from "../i18n/I18nProvider";
import { StatusDot, type ObsTone } from "./StatusDot";

export interface NavItem<Id extends string> {
  id: Id;
  label: string;
  /** Decorative symbol shown next to the label. */
  icon: ReactNode;
  /** A live state shown on the icon (colour and a dot) and spoken after the label, e.g. "OBS, connected". */
  status?: { tone: ObsTone; label: string };
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
        {items.map((item, index) => {
          const name = item.status ? `${item.label}, ${item.status.label}` : item.label;
          return (
            // Positional keys: an item that changes in place (the Deck item becoming the first deck board once the
            // boards load) keeps its element, so a tap already on its way still lands.
            // eslint-disable-next-line react/no-array-index-key
            <li key={index}>
              <a
                href={`#${item.id}`}
                className={item.status ? `side-nav-link side-nav-link-${item.status.tone}` : "side-nav-link"}
                aria-current={item.id === active ? "page" : undefined}
                title={collapsed ? name : undefined}
                onClick={(event) => select(event, item.id)}
              >
                <span className="side-nav-icon" aria-hidden="true">
                  {item.icon}
                  {item.status && <StatusDot tone={item.status.tone} />}
                </span>
                <span className="side-nav-label">
                  {item.label}
                  {item.status && <span className="visually-hidden">, {item.status.label}</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
