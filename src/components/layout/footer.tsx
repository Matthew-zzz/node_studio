import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { site } from "@/config/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-main">
        <Brand />
        <p className="footer-positioning">{site.tagline}</p>
        <ExternalLink href={site.contact}>
          Telegram
          <Icon name="diagonal" />
        </ExternalLink>
      </div>
      <div className="container footer-contacts" aria-label="Контактные данные">
        <div>
          <span>Проекты и общие вопросы</span>
          <a href={`mailto:${site.projectsEmail}`}>{site.projectsEmail}</a>
        </div>
        <div>
          <span>Техническая поддержка</span>
          <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
        </div>
        <div>
          <span>Телефон</span>
          <a href={`tel:${site.phone}`}>{site.phoneDisplay}</a>
        </div>
        <div>
          <span>Исполнитель · самозанятый</span>
          <span className="footer-requisites">
            Фатнев Матвей Сергеевич
            <br />
            ИНН 463312994377
          </span>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          ©
          {new Date().getFullYear()}
          {' '}
          Node Studio
        </span>
        <Link href="/terms/">Публичная оферта</Link>
        <Link href="/#main">Наверх ↑</Link>
      </div>
    </footer>
  );
}
