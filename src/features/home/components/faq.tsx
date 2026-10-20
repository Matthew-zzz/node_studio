import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { site } from "@/config/site";
import { questions } from "@/features/home/data/content";

export function Faq() {
  return (
    <section className="faq-section section" id="faq">
      <div className="container faq-layout">
        <div className="faq-intro reveal">
          <h2>
            <ResponsiveCopy
              wide={<>
                Остались
                <br />
                <span className="muted">вопросы?</span>
              </>}
              compact="Вопросы до старта."
            />
          </h2>
          <p>
            А если вашего вопроса здесь нет —
            <br />
            <ExternalLink href={site.contact}>
              просто напишите нам
              <Icon name="diagonal" />
            </ExternalLink>
          </p>
        </div>
        <div className="faq-list reveal">
          {questions.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>
                <span>{item.question}</span>
                <Icon name="plus" />
              </summary>
              <div className="faq-answer"><p>{item.answer}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
