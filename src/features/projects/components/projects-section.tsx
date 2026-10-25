import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { site } from "@/config/site";
import styles from "./projects-section.module.css";

const conceptProjects = [
  {
    title: "Forma",
    category: "Сервис для студий",
    description: "Запись, расписание и оплата занятий — в одном пространстве для команды и клиентов.",
    visual: "forma",
  },
  {
    title: "Northline",
    category: "Сайт архитектурного бюро",
    description: "Цифровая витрина проектов с выразительной подачей портфолио и материалов студии.",
    visual: "northline",
  },
  {
    title: "Relay",
    category: "Автоматизация процессов",
    description: "Заявки из разных каналов собираются в общую очередь и распределяются по команде.",
    visual: "relay",
  },
  {
    title: "Noma",
    category: "Интернет-магазин",
    description: "Каталог предметов для дома с подборками, быстрым поиском и удобным оформлением заказа.",
    visual: "noma",
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

export function ProjectsSection() {
  return (
    <section className={`projects-section section ${styles.section}`} id="projects">
      <div className="container">
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

        <div className={styles.grid}>
          <article className={`${styles.item} ${styles.itemVectra} reveal`}>
            <Link className={styles.media} href="/projects/vectra/" aria-label="Открыть проект Vectra">
              <Image src="/assets/vectra-showcase.png" alt="Презентация Vectra — управление ИИ-ассистентами" fill sizes="(max-width: 760px) 100vw, 48vw" />
            </Link>
            <div className={styles.caption}>
              <p>База знаний и ИИ-агенты, которые отвечают пользователям по документам компании.</p>
            </div>
          </article>

          <article className={`${styles.item} ${styles.itemAutoparts} reveal`}>
            <Link className={styles.media} href="/projects/autoparts/" aria-label="Открыть проект магазина автозапчастей">
              <Image src="/assets/autoparts-showcase.png" alt="Премиальная презентация каталога автозапчастей и локальной системы магазина" fill sizes="(max-width: 760px) 100vw, 48vw" />
            </Link>
            <div className={styles.caption}>
              <p>Поиск деталей, подбор аналогов и проверка остатков в одной системе для сотрудников.</p>
            </div>
          </article>

          <article className={`${styles.item} ${styles.itemNexus} reveal`}>
            <div className={styles.media}>
              <ConceptArtwork visual="nexus" />
              <span className={styles.conceptTag}>Концепт</span>
              <span className={styles.conceptTitle}>Nexus</span>
            </div>
            <div className={styles.caption}>
              <p>Единое рабочее пространство, которое собирает задачи, документы и коммуникации команды.</p>
            </div>
          </article>

          <article className={`${styles.item} ${styles.itemAi} reveal`}>
            <div className={styles.media}>
              <video autoPlay loop muted playsInline preload="metadata" aria-label="Видео презентация NodeStudio AI">
                <source src="/assets/nodestudio-ai-showcase.mp4" type="video/mp4" />
              </video>
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
          </article>

          {conceptProjects.map((project) => (
            <article className={`${styles.item} ${styles.conceptItem} reveal`} key={project.visual}>
              <div className={styles.media}>
                <ConceptArtwork visual={project.visual} />
                <span className={styles.conceptTag}>Концепт</span>
              </div>
              <div className={styles.caption}>
                <p>{project.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
