"use client";

import type { ReactNode } from "react";
import styles from "./compact-style-editor.module.css";

export function CompactAccordionSection({
  id,
  index,
  title,
  summary,
  expanded,
  onToggle,
  action,
  children,
}: {
  id: string;
  index?: string;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const panelId = `${id}-panel`;
  const buttonId = `${id}-toggle`;

  return (
    <section className={styles.accordion} data-expanded={expanded} aria-labelledby={buttonId}>
      <div className={styles.accordionHeader}>
        <button
          id={buttonId}
          type="button"
          className={styles.accordionToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className={styles.chevron} aria-hidden="true">›</span>
          <span className={styles.index} aria-hidden="true">{index ?? ""}</span>
          <span className={styles.title}>{title}</span>
          <span className={styles.summary}>{summary}</span>
        </button>
        {action && <div className={styles.headerAction}>{action}</div>}
      </div>
      <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!expanded}>
        <div className={styles.accordionPanel}>{children}</div>
      </div>
    </section>
  );
}

export function CompactStyleEditorFrame({
  intro,
  controls,
  aside,
  footer,
}: {
  intro: ReactNode;
  controls: ReactNode;
  aside: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.scrollArea}>
        <div className={styles.intro}>{intro}</div>
        <div className={styles.workspace}>
          <div className={styles.controls}>{controls}</div>
          <aside className={styles.aside}>{aside}</aside>
        </div>
      </div>
      <footer className={styles.footer}>{footer}</footer>
    </div>
  );
}

export { styles as compactStyleEditorStyles };
