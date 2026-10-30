"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { site } from "@/config/site";
import styles from "./projects-section.module.css";

const categories = [
  { id: "all", label: "Все проекты" },
  { id: "from-scratch", label: "Проекты с нуля" },
  { id: "copies", label: "Копии проектов" },
  { id: "scripts", label: "Скрипты" },
  { id: "web-apps", label: "Веб-приложения" },
] as const;

type Category = (typeof categories)[number]["id"];

export interface ProjectShowcaseItem {
  readonly id: string;
  readonly title: string;
  readonly categories: readonly Exclude<Category, "all">[];
  readonly className?: string | undefined;
  readonly content: ReactNode;
}

export function ProjectShowcase({ items }: { items: readonly ProjectShowcaseItem[] }) {
  const [selected, setSelected] = useState<Category>("all");
  const matches = (item: ProjectShowcaseItem) => selected === "all" || item.categories.some((category) => category === selected);
  const count = items.filter(matches).length;

  return (
    <>
      <div className={styles.filters} role="group" aria-label="Категории проектов">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={styles.filterButton}
            aria-pressed={selected === category.id}
            aria-controls="project-showcase-results"
            onClick={() => setSelected(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">{`${categories.find((category) => category.id === selected)?.label}. Найдено проектов: ${count}.`}</p>
      <div id="project-showcase-results">
        <div className={styles.grid} hidden={count === 0} data-filtered={selected !== "all"}>
          {items.map((item) => (
            <article
              key={item.id}
              aria-label={item.title}
              className={`${styles.item} ${item.className ?? ""} reveal`}
              hidden={!matches(item)}
            >
              {item.content}
            </article>
          ))}
        </div>
        <div className={styles.empty} hidden={count > 0}>
          <p>В этом разделе пока нет проектов.</p>
          <ExternalLink className={`button button-primary ${styles.askButton}`} href={site.contact}>
            Обсудить проект
            <Icon name="diagonal" />
          </ExternalLink>
        </div>
      </div>
    </>
  );
}
