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
      <div className="container footer-bottom">
        <span>
          ©
          {new Date().getFullYear()}
          {' '}
          Node Studio
        </span>
        <Link href="/#main">Наверх ↑</Link>
      </div>
    </footer>
  );
}
