import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { AnimatedIllustration } from "@/features/services/components/animated-illustration";

export function IntelligenceArt() {
  return (
    <AnimatedIllustration className="ability-art intelligence-art" aria-label="Пример ИИ-агента: находит информацию в ваших документах и сервисах и готовит ответ для проверки сотрудником." role="img">
      <svg className="ability-beams" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient
            id="intelligence-beam"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop stopColor="#5988ff" />
            <stop offset="1" stopColor="#b18aff" />
          </linearGradient>
        </defs>
        <g data-beam-from="docs" data-beam-to="agent" data-beam-curvature="-35">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#intelligence-beam)"
            pathLength="100"
            style={{ "--beam-delay": "0s" } as CSSProperties}
          />
        </g>
        <g data-beam-from="tools" data-beam-to="agent" data-beam-curvature="35">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#intelligence-beam)"
            pathLength="100"
            style={{ "--beam-delay": "-0.65s" } as CSSProperties}
          />
        </g>
        <g data-beam-from="agent" data-beam-to="answer" data-beam-curvature="0">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#intelligence-beam)"
            pathLength="100"
            style={{ "--beam-delay": "-1.3s" } as CSSProperties}
          />
        </g>
      </svg>
      <div className="ai-sources">
        <div className="ai-source">
          <span data-beam-point="docs">
            <Icon name="document" className="" strokeWidth={1.5} />
          </span>
          <strong>
            {"Документы"}
          </strong>
        </div>
        <div className="ai-source">
          <span data-beam-point="tools">
            <Icon name="service" className="" strokeWidth={1.5} />
          </span>
          <strong>
            {"Ваши сервисы"}
          </strong>
        </div>
      </div>
      <div className="ai-agent">
        <span className="ai-agent-disc" data-beam-point="agent">
          <Icon name="spark" className="" strokeWidth={1.5} />
        </span>
        <strong>
          {"ИИ-агент"}
        </strong>
      </div>
      <div className="ai-answer" data-beam-point="answer">
        <div className="ai-question">
          {"Какие документы нужны?"}
        </div>
        <div className="ai-response">
          <Icon name="spark" className="" strokeWidth={1.5} />
          <span>
            {"Вот список из вашей инструкции."}
          </span>
        </div>
        <span className="ai-answer-source">
          <Icon name="document" className="" strokeWidth={1.5} />
          {"Ваши материалы"}
        </span>
        <div className="ai-human">
          <Icon name="check" className="" strokeWidth={1.5} />
          {"Проверка сотрудником"}
        </div>
      </div>
    </AnimatedIllustration>
  );
}
