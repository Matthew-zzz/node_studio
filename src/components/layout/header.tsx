import { Brand } from "@/components/ui/brand";
import Link from "next/link";
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
        <div className="reading-progress" aria-hidden="true"><span /></div>
        <div className="container header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Главная навигация">
            {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
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
