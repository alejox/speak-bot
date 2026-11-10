import type { MouseEvent } from "react";
import { useT } from "../i18n/I18nProvider";

export interface NavItem<Id extends string> {
  id: Id;
  label: string;
  /** Decorative symbol shown next to the label. */
  icon: string;
}

interface SideNavProps<Id extends string> {
  items: readonly NavItem<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
}

/**
 * Section navigation: a left sidebar on wide screens and a bottom tab bar on narrow ones
 * (pure CSS), so every section stays one tap away without a drawer to open.
 */
export function SideNav<Id extends string>({ items, active, onSelect }: SideNavProps<Id>) {
  const t = useT();
  const select = (event: MouseEvent<HTMLAnchorElement>, id: Id) => {
    event.preventDefault();
    onSelect(id);
  };
  return (
    <nav className="side-nav" aria-label={t("nav.label")}>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="side-nav-link"
              aria-current={item.id === active ? "page" : undefined}
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
