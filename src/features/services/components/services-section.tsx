import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { site } from "@/config/site";
import { clientSituations, serviceOfferings } from "@/features/services/data/services";
import { IntegrationArt } from "@/features/services/components/illustrations/integration-art";
import { AutomationArt } from "@/features/services/components/illustrations/automation-art";
import { ProductArt } from "@/features/services/components/illustrations/product-art";
import { IntelligenceArt } from "@/features/services/components/illustrations/intelligence-art";
import { EvolutionArt } from "@/features/services/components/illustrations/evolution-art";
import type { SituationId } from "@/features/services/model/types";

const illustrations = { connect: IntegrationArt, automate: AutomationArt, build: ProductArt, intelligence: IntelligenceArt, evolve: EvolutionArt } satisfies Record<SituationId, () => ReactNode>;

export function ServicesSection() {
  return (
    <section className="ability-section section" id="services" aria-labelledby="abilities-title">
      <div className="container">
        <div className="ability-heading reveal">
          <h2 id="abilities-title">
            <ResponsiveCopy
              wide={<>
                Меньше ручной работы.
                <br />
                <span className="muted">Больше возможностей.</span>
              </>}
              compact="Что нужно сделать?"
            />
          </h2>
        </div>
        <div className="ability-stories">
          {clientSituations.map((ability) => {
            const Illustration = illustrations[ability.id];
            return (
              <article className={`ability-story ability-${ability.id}`} aria-labelledby={`ability-title-${ability.id}`} key={ability.id}>
                <div className="ability-copy reveal">
                  <h3 id={`ability-title-${ability.id}`}>{ability.title}</h3>
                  <p className="ability-outcome">
                    <Icon name="arrow" />
                    <span>{ability.outcome}</span>
                  </p>
                </div>
                <Illustration />
              </article>
            );
          })}
        </div>
        <div className="mobile-services">
          {serviceOfferings.map((service) => (
            <details className="service-disclosure" name="studio-services" key={service.id}>
              <summary>
                <span className="service-disclosure-icon" aria-hidden="true"><Icon name={service.icon} className="" strokeWidth={1.5} /></span>
                <span className="service-disclosure-title">{service.title}</span>
                <Icon name="plus" className="icon service-disclosure-toggle" />
              </summary>
              <div className="service-disclosure-body">
                <p>{service.description}</p>
                <ul className="service-disclosure-tasks" aria-label="Какие задачи решаем">
                  {service.tasks.map((task) => (
                    <li key={task}>
                      <Icon name="check" className="" strokeWidth={1.5} />
                      <span>{task}</span>
                    </li>
                  ))}
                </ul>
                <div className="service-disclosure-result">
                  <Icon name="trigger" className="" strokeWidth={1.5} />
                  <p>{service.result}</p>
                </div>
                {service.proof && (
                  <Link className="service-disclosure-proof" href={service.proof.href}>
                    <span>{service.proof.label}</span>
                    <Icon name="diagonal" />
                  </Link>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
      <aside className="ability-assurance" aria-labelledby="ability-assurance-title">
        <div className="container ability-assurance-inner reveal">
          <span className="ability-assurance-symbol" aria-hidden="true">
            <Icon name="telegram" />
            <Icon name="arrow" />
            <Icon name="code" />
          </span>
          <div>
            <h3 id="ability-assurance-title"><ResponsiveCopy wide="Вам не нужно переводить свою работу на язык разработки." compact="Вам не нужен язык разработки." /></h3>
            <p><ResponsiveCopy wide="Расскажите, как всё устроено, — мы разберёмся в специфике вашей сферы и поможем превратить задачу в понятное техническое решение." compact="Расскажите, как всё устроено. Мы разберёмся в вашей сфере и предложим решение." /></p>
          </div>
        </div>
      </aside>
      <div className="container">
        <div className="ability-contact">
          <p>Узнали свою ситуацию?</p>
          <ExternalLink href={site.contact}>
            Рассказать о задаче
            <Icon name="diagonal" />
          </ExternalLink>
        </div>
      </div>
    </section>
  );
}
