import { TechnologyIcon } from "@/features/home/components/technology-icon";
import { MotionSurface } from "@/components/ui/motion-surface";
import { directions, technologies } from "@/features/home/data/content";

export function Marquee({ kind }: { kind: "directions" | "stack" }) {
  return (
    <MotionSurface
      marquee
      className={`studio-marquee studio-marquee--${kind}`}
      role="region"
      aria-label={kind === "directions" ? "Направления работы студии" : "Технологии и инструменты, с которыми работаем"}
    >
      <div className="marquee-viewport">
        <div className="marquee-track">
          {[false, true].map((duplicate) => (
            <ul
              className="marquee-group"
              key={String(duplicate)}
              aria-hidden={duplicate || undefined}
              role="list"
            >
              {kind === "directions" ? directions.map((word) => (
                <li className="marquee-direction" key={word}>
                  <span>{word}</span>
                  <span className="marquee-spark" aria-hidden="true">✦</span>
                </li>
              )) : technologies.map((technology) => (
                <li className="marquee-technology" key={technology.icon}>
                  <TechnologyIcon name={technology.icon} />
                  <span>{technology.label}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </MotionSurface>
  );
}
