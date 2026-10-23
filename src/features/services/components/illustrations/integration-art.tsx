import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { AnimatedIllustration } from "@/features/services/components/animated-illustration";

export function IntegrationArt() {
  return (
    <AnimatedIllustration className="ability-art integration-art" aria-label="Ваш сервис обменивается данными с сайтом, таблицами, Telegram, CRM, базой данных и почтой." role="img">
      <svg className="ability-beams" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient
            id="integrations-beam"
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
        <g data-beam-from="site" data-beam-to="hub" data-beam-curvature="-65">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#integrations-beam)"
            pathLength="100"
            style={{ "--beam-delay": "0s" } as CSSProperties}
          />
        </g>
        <g data-beam-from="table" data-beam-to="hub" data-beam-curvature="0">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#integrations-beam)"
            pathLength="100"
            style={{ "--beam-delay": "-0.65s" } as CSSProperties}
          />
        </g>
        <g data-beam-from="telegram" data-beam-to="hub" data-beam-curvature="65">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#integrations-beam)"
            pathLength="100"
            style={{ "--beam-delay": "-1.3s" } as CSSProperties}
          />
        </g>
        <g data-beam-from="hub" data-beam-to="crm" data-beam-curvature="65">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#integrations-beam)"
            pathLength="100"
            style={{ "--beam-delay": "-1.9500000000000002s" } as CSSProperties}
          />
        </g>
        <g data-beam-from="hub" data-beam-to="data" data-beam-curvature="0">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#integrations-beam)"
            pathLength="100"
            style={{ "--beam-delay": "-2.6s" } as CSSProperties}
          />
        </g>
        <g data-beam-from="hub" data-beam-to="mail" data-beam-curvature="-65">
          <path className="ability-beam-track" />
          <path
            className="ability-beam-light"
            stroke="url(#integrations-beam)"
            pathLength="100"
            style={{ "--beam-delay": "-3.25s" } as CSSProperties}
          />
        </g>
      </svg>
      <div className="ability-service-node node-left node-top">
        <span className="ability-service-disc" data-beam-point="site">
          <Icon name="site" className="" strokeWidth={1.5} />
        </span>
        <span>
          {"Сайт"}
        </span>
      </div>
      <div className="ability-service-node node-left node-middle">
        <span className="ability-service-disc" data-beam-point="table">
          <Icon name="table" className="" strokeWidth={1.5} />
        </span>
        <span>
          {"Таблицы"}
        </span>
      </div>
      <div className="ability-service-node node-left node-bottom">
        <span className="ability-service-disc" data-beam-point="telegram">
          <Icon name="telegram" className="" strokeWidth={1.5} />
        </span>
        <span>
          {"Telegram"}
        </span>
      </div>
      <div className="ability-integration-core">
        <span className="ability-core-disc" data-beam-point="hub">
          <span className="ability-core-label">
            {"Ваш"}
            <br />
            {"сервис"}
          </span>
        </span>
      </div>
      <div className="ability-service-node node-right node-top">
        <span className="ability-service-disc" data-beam-point="crm">
          <Icon name="people" className="" strokeWidth={1.5} />
        </span>
        <span>
          {"CRM"}
        </span>
      </div>
      <div className="ability-service-node node-right node-middle">
        <span className="ability-service-disc" data-beam-point="data">
          <Icon name="database" className="" strokeWidth={1.5} />
        </span>
        <span>
          {"Ваша база"}
        </span>
      </div>
      <div className="ability-service-node node-right node-bottom">
        <span className="ability-service-disc" data-beam-point="mail">
          <Icon name="mail" className="" strokeWidth={1.5} />
        </span>
        <span>
          {"Почта"}
        </span>
      </div>
    </AnimatedIllustration>
  );
}
