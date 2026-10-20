import { TechnologyIcon } from "@/features/home/components/technology-icon";
import { MarqueeMotion } from "@/features/home/components/marquee-motion";
import { directions, technologies } from "@/features/home/data/content";
import styles from "./marquee.module.css";

export function Marquee({ kind }: { kind: "directions" | "stack" }) {
  return (
    <MarqueeMotion
      className={`${styles.root} ${styles[kind]}`}
      data-marquee={kind}
      role="region"
      aria-label={kind === "directions" ? "Направления работы студии" : "Технологии и инструменты, с которыми работаем"}
    >
      <div className={styles.viewport}>
        <div className={styles.track}>
          {[false, true].map((duplicate) => (
            <ul
              className={styles.group}
              key={String(duplicate)}
              aria-hidden={duplicate || undefined}
              role="list"
            >
              {kind === "directions" ? directions.map((word) => (
                <li className={styles.direction} key={word}>
                  <span>{word}</span>
                  <span className={styles.spark} aria-hidden="true">✦</span>
                </li>
              )) : technologies.map((technology) => (
                <li className={styles.technology} key={technology.icon}>
                  <TechnologyIcon name={technology.icon} />
                  <span>{technology.label}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </MarqueeMotion>
  );
}
