import { Brand } from "@/components/ui/brand";
import { SectionLink } from "@/components/ui/section-link";
import { Icon } from "@/components/ui/icon";
import { ExternalLink } from "@/components/ui/external-link";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { navigation } from "@/config/navigation";
import { site } from "@/config/site";

export function Header() {
  return (
    <>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <header className="header">
        <div className="container header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Главная навигация">
            {navigation.map((item) => <SectionLink key={item.href} href={item.href}>{item.label}</SectionLink>)}
          </nav>
          <ExternalLink className="header-contact" href={site.contact}>
            Обсудить задачу
            <Icon name="diagonal" />
          </ExternalLink>
          <MobileMenu />
        </div>
      </header>
    </>
  );
}
