import type { ReactNode } from "react";
import styles from "./projects-section.module.css";

export interface ProjectShowcaseItem {
  readonly id: string;
  readonly title: string;
  readonly className?: string | undefined;
  readonly content: ReactNode;
}

export function ProjectShowcase({ items }: { items: readonly ProjectShowcaseItem[] }) {
  return (
    <div id="project-showcase-results" className={styles.grid}>
      {items.map((item) => (
        <article
          key={item.id}
          aria-label={item.title}
          className={`${styles.item} ${item.className ?? ""} reveal`}
        >
          {item.content}
        </article>
      ))}
    </div>
  );
}
