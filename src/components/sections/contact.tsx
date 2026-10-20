import { CopyContact } from "@/components/ui/copy-contact";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { site } from "@/config/site";

export function Contact() {
  return (
    <section className="contact-section section" id="contact">
      <div className="container">
        <div className="contact-panel reveal">
          <div className="contact-body">
            <div>
              <h2>
                <ResponsiveCopy
                  wide={<>
                    Что в вашей работе
                    <br />
                    давно хочется
                    <span>упростить?</span>
                  </>}
                  compact="Обсудим вашу задачу?"
                />
              </h2>
              <p><ResponsiveCopy wide="Расскажите, что сейчас приходится делать вручную или какого инструмента вам не хватает. Поможем разобраться, что можно автоматизировать, связать или разработать." compact="Что хотите упростить или создать? Расскажите — предложим решение." /></p>
            </div>
          </div>
          <div className="contact-start">
            <ExternalLink className="button button-primary" href={site.contact}>
              <ResponsiveCopy wide="Рассказать о задаче в Telegram" compact="Написать в Telegram" />
              <Icon name="diagonal" />
            </ExternalLink>
            <p>
              <ResponsiveCopy
                wide={<>
                  Начать можно так:
                  <span>«Сейчас мы делаем …, а хотим …».</span>
                </>}
                compact="«Сейчас …, а хотим …»"
              />
            </p>
          </div>
          <div className="contact-bottom">
            <ExternalLink className="contact-handle" href={site.contact}>
              <Icon name="telegram" />
              {site.handle}
            </ExternalLink>
            <CopyContact value={site.handle} />
            <p>
              <Icon name="clock" />
              <ResponsiveCopy wide={`${site.hours} · обычно отвечаем в течение часа`} compact={`${site.hours} · ответ до часа`} />
            </p>
          </div>
        </div>
        <p className="contact-note">Общаемся в переписке.</p>
      </div>
    </section>
  );
}
