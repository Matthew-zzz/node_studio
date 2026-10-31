import Link from "next/link";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { ViewportVideo } from "@/components/ui/viewport-video";
import { site } from "@/config/site";
import { ProjectShowcase, type ProjectShowcaseItem } from "./project-showcase";
import { ShowcaseImage } from "./showcase-image";
import styles from "./projects-section.module.css";

const imageProjects = [
  {
    id: "xnr-bots",
    title: "XNR Bots",
    image: "xnrBots",
    href: "/projects/xnr-bots/",
    description: "Визуальный конструктор Telegram-ботов: сообщения, кнопки и связи между блоками в одном редакторе.",
  },
  {
    id: "poison",
    title: "Poison",
    image: "poizon",
    href: "/projects/poison/",
    description: "Интернет-магазин одежды, обуви и аксессуаров с каталогом и калькулятором стоимости.",
  },
  {
    id: "tap-league",
    title: "Tap League",
    image: "tapLeague",
    href: "/projects/tap-league/",
    description: "Игровой кликер в Telegram с балансом, усилениями и приглашением друзей.",
  },
  {
    id: "telegram-clicker",
    title: "Кликер — Telegram WebApp",
    image: "clicker",
    href: "/projects/telegram-clicker/",
    description: "Игровое мини-приложение в Telegram: накопление очков, энергия и таблица лидеров.",
  },
] as const;

const showcaseItems: readonly ProjectShowcaseItem[] = [
  {
    id: "vectra",
    title: "Vectra",
    content: (
      <>
        <Link className={styles.media} href="/projects/vectra/" aria-label="Открыть проект Vectra">
          <ShowcaseImage name="vectra" alt="Презентация Vectra — управление ИИ-ассистентами" />
        </Link>
        <div className={styles.caption}>
          <p>База знаний и ИИ-агенты, которые отвечают пользователям по документам компании.</p>
        </div>
      </>
    ),
  },
  {
    id: "autoparts",
    title: "Магазин автозапчастей",
    content: (
      <>
        <Link className={styles.media} href="/projects/autoparts/" aria-label="Открыть проект магазина автозапчастей">
          <ShowcaseImage name="autoparts" alt="Премиальная презентация каталога автозапчастей и локальной системы магазина" />
        </Link>
        <div className={styles.caption}>
          <p>Поиск деталей, подбор аналогов и проверка остатков в одной системе для сотрудников.</p>
        </div>
      </>
    ),
  },
  {
    id: "anime-love",
    title: "AnimeLove",
    className: styles.itemAnimeLove,
    content: (
      <>
        <Link className={styles.media} href="/projects/anime-love/" aria-label="Открыть проект AnimeLove">
          <ShowcaseImage name="animeLove" alt="Презентация AnimeLove — каталог аниме и подборки" />
        </Link>
        <div className={styles.caption}>
          <p>Каталог аниме, встроенный плеер и персональные профили в приложении Telegram.</p>
        </div>
      </>
    ),
  },
  {
    id: "nodestudio-ai",
    title: "NodeStudio AI",
    className: styles.itemAi,
    content: (
      <>
        <Link className={styles.media} href="/projects/nodestudio-ai/" aria-label="Открыть проект NodeStudio AI">
          <ViewportVideo src="/assets/video/ai-showcase.mp4" poster="/assets/video/ai-poster.jpg" aria-label="Видео презентация NodeStudio AI" />
          <div className={styles.aiTitle}>
            <span>ИИ-агент студии</span>
            <h3>NodeStudio AI</h3>
          </div>
        </Link>
        <div className={styles.caption}>
          <p>Наш ИИ-агент проконсультирует по вопросам разработки, услугам студии и вашему проекту.</p>
          <ExternalLink className={`button button-primary ${styles.askButton}`} href={site.contact}>
            Спросить
            <Icon name="diagonal" />
          </ExternalLink>
        </div>
      </>
    ),
  },
  ...imageProjects.map((project): ProjectShowcaseItem => ({
    id: project.id,
    title: project.title,
    content: (
      <>
        <Link className={`${styles.media} ${styles.imageOnly}`} href={project.href} aria-label={`Открыть проект ${project.title}`}>
          <ShowcaseImage name={project.image} alt={`${project.title}. ${project.description}`} />
        </Link>
        <div className={styles.caption}>
          <p>{project.description}</p>
        </div>
      </>
    ),
  })),
];

export function ProjectsSection() {
  return (
    <section className={`projects-section section ${styles.section}`} id="projects">
      <div className="container" data-section-anchor="">
        <div className={`section-head reveal ${styles.heading}`}>
          <div>
            <p className="eyebrow">Избранные проекты</p>
            <h2>
              <ResponsiveCopy
                wide={<>
                  Вот как это реализовано
                  <br />
                  <span className="muted">в наших проектах.</span>
                </>}
                compact="Наши проекты."
              />
            </h2>
          </div>
        </div>
        <ProjectShowcase items={showcaseItems} />
      </div>
    </section>
  );
}
