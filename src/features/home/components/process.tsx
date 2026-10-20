import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { site } from "@/config/site";
import { processSteps } from "@/features/home/data/content";

export function Process() {
  return (
    <section className="process-section section" id="process">
      <div className="container">
        <div className="section-head reveal">
          <div>
            <h2>
              <ResponsiveCopy
                wide={<>
                  Начните с задачи.
                  <br />
                  Техническую часть разберём вместе.
                </>}
                compact="От задачи до запуска."
              />
            </h2>
          </div>
        </div>
        <div className="process-grid">
          {processSteps.map((step) => (
            <article className="process-step reveal" key={step.title}>
              <span className="process-step-symbol" aria-hidden="true"><Icon name={step.icon} /></span>
              <h3><ResponsiveCopy wide={step.title} compact={step.compactTitle} /></h3>
              <p><ResponsiveCopy wide={step.description} compact={step.compactDescription} /></p>
            </article>
          ))}
        </div>
        <div className="process-note reveal">
          <Icon name="check" />
          <p><ResponsiveCopy wide="От обсуждения задачи до запуска вы общаетесь напрямую с разработчиком." compact="Общаемся напрямую с разработчиком." /></p>
          <ExternalLink href={site.contact}>
            Рассказать о задаче
            <Icon name="diagonal" />
          </ExternalLink>
        </div>
      </div>
    </section>
  );
}
