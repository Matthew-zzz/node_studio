import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/ui/brand";
import { AnimatedIllustration } from "@/features/services/components/animated-illustration";

export function EvolutionArt() {
  return (
    <AnimatedIllustration className="ability-art evolution-art" aria-label="Пример доработки: к готовому сервису добавляются функции и инструменты под рабочий процесс бизнеса." role="img">
      <svg className="ability-beams" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient
            id="evolution-beam"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop stopColor="var(--brand-cyan)" />
            <stop offset=".35" stopColor="var(--brand-blue)" />
            <stop offset=".7" stopColor="var(--brand-violet)" />
            <stop offset="1" stopColor="var(--brand-pink)" />
          </linearGradient>
        </defs>
        <g data-beam-from="prototype" data-beam-to="release" data-beam-curvature="0">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#evolution-beam)"
            pathLength="100"
            style={{ "--beam-delay": "0s" } as CSSProperties}
          />
        </g>
      </svg>
      <div className="evolution-window evolution-before" data-beam-point="prototype">
        <div className="evolution-window-bar">
          <span className="product-window-dots">
            <i />
            <i />
            <i />
          </span>
          <strong>
            {"Готовый сервис"}
          </strong>
        </div>
        <div className="evolution-draft">
          <span className="evolution-code-mark">
            {"{ }"}
          </span>
          <span className="evolution-code-line" />
          <span className="evolution-code-line" />
          <span className="evolution-code-line" />
          <div className="evolution-draft-feature">
            <Icon name="service" className="" strokeWidth={1.5} />
            {"Не хватает функций"}
          </div>
        </div>
      </div>
      <div className="evolution-window evolution-after" data-beam-point="release">
        <div className="evolution-window-bar">
          <span className="product-window-dots">
            <i />
            <i />
            <i />
          </span>
          <strong>
            {"Решение под вас"}
          </strong>
        </div>
        <div className="evolution-ready">
          <div className="evolution-ready-mark">
            <span className="ability-brand-mark" aria-hidden="true">
              <BrandMark />
            </span>
          </div>
          <span className="evolution-ready-row">
            <Icon name="check" className="" strokeWidth={1.5} />
            {"Нужная функция"}
          </span>
          <span className="evolution-ready-row">
            <Icon name="check" className="" strokeWidth={1.5} />
            {"Ваша логика"}
          </span>
          <span className="evolution-ready-row">
            <Icon name="check" className="" strokeWidth={1.5} />
            {"Запуск на сервере"}
          </span>
        </div>
      </div>
    </AnimatedIllustration>
  );
}
