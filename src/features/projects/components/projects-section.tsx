import Link from "next/link";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { ViewportVideo } from "@/components/ui/viewport-video";
import { site } from "@/config/site";
import { ProjectShowcase, type ProjectShowcaseItem } from "./project-showcase";
import { ShowcaseImage } from "./showcase-image";
import styles from "./projects-section.module.css";

const conceptProjects = [
  {
    title: "Forma",
    description: "Запись, расписание и оплата занятий — в одном пространстве для команды и клиентов.",
    visual: "forma",
  },
  {
    title: "Northline",
    description: "Цифровая витрина проектов с выразительной подачей портфолио и материалов студии.",
    visual: "northline",
  },
  {
    title: "Relay",
    description: "Заявки из разных каналов собираются в общую очередь и распределяются по команде.",
    visual: "relay",
  },
  {
    title: "Noma",
    description: "Каталог предметов для дома с подборками, быстрым поиском и удобным оформлением заказа.",
    visual: "noma",
  },
  {
    title: "Nexus",
    description: "Единое рабочее пространство, которое собирает задачи, документы и коммуникации команды.",
    visual: "nexus",
  },
] as const;

const imageProjects = [
  {
    id: "xnr-bots",
    title: "XNR Bots",
    image: "xnrBots",
    description: "Визуальный конструктор Telegram-ботов: сообщения, кнопки и связи между блоками в одном редакторе.",
  },
  {
    id: "poizon",
    title: "Poizon",
    image: "poizon",
    description: "Интернет-магазин одежды, обуви и аксессуаров с каталогом и калькулятором стоимости.",
  },
  {
    id: "tap-league",
    title: "Tap League",
    image: "tapLeague",
    description: "Игровой кликер в Telegram с балансом, усилениями и приглашением друзей.",
  },
  {
    id: "telegram-clicker",
    title: "Кликер — Telegram WebApp",
    image: "clicker",
    description: "Игровое мини-приложение в Telegram: накопление очков, энергия и таблица лидеров.",
  },
] as const;

function ConceptArtwork({ visual }: { visual: string }) {
  return (
    <div className={styles.conceptArtwork} data-visual={visual} aria-hidden="true">
      <div className={styles.conceptWindow}>
        <div className={styles.windowBar}>
          <i />
          <i />
          <i />
          <span />
        </div>
        <div className={styles.windowContent}>
          <div className={styles.windowNav}>
            <b />
            <i />
            <i />
            <i />
          </div>
          <div className={styles.windowHero}>
            <div className={styles.heroLines}>
              <i />
              <i />
              <i />
            </div>
            <div className={styles.heroShape} />
          </div>
          <div className={styles.windowCards}>
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <div className={styles.floatingTile}>
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

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
        <div className={styles.media}>
          <ViewportVideo src="/assets/video/ai-showcase.mp4" poster="/assets/video/ai-poster.jpg" aria-label="Видео презентация NodeStudio AI" />
          <div className={styles.aiTitle}>
            <span>ИИ-агент студии</span>
            <h3>NodeStudio AI</h3>
          </div>
        </div>
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
        <div className={`${styles.media} ${styles.imageOnly}`}>
          <ShowcaseImage name={project.image} alt={`${project.title}. ${project.description}`} />
        </div>
        <div className={styles.caption}>
          <p>{project.description}</p>
        </div>
      </>
    ),
  })),
  ...conceptProjects.map((project): ProjectShowcaseItem => ({
    id: project.visual,
    title: project.title,
    className: styles.conceptItem,
    content: (
      <>
        <div className={styles.media}>
          <ConceptArtwork visual={project.visual} />
          <span className={styles.conceptTag}>Концепт</span>
        </div>
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
