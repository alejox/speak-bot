import { useEffect, useId, useRef, type ReactNode } from "react";

interface SectionViewProps {
  title: string;
  /** Move focus to the heading, e.g. after the user picked this section in the menu. */
  focusHeading?: boolean;
  children: ReactNode;
}

/** One main-area section with its heading. */
export function SectionView({ title, focusHeading = false, children }: SectionViewProps) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  return (
    <section className="section" aria-labelledby={headingId}>
      <h2 id={headingId} ref={heading} tabIndex={-1} className="section-title">
        {title}
      </h2>
      {children}
    </section>
  );
}
