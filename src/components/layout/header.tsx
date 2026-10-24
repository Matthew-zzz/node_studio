import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { navigation } from "@/config/navigation";

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
          <Link className="header-contact" href="/cabinet/">
            Личный кабинет
            <Icon name="people" />
          </Link>
          <MobileMenu />
        </div>
      </header>
    </>
  );
}
