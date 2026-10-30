import Link from "next/link";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { site } from "@/config/site";
import { HeroAtmosphere } from "@/features/home/components/hero-atmosphere";
import { Screenshot } from "@/features/projects/components/screenshot";
import { getScreenshot } from "@/features/projects/data/screenshots";
import { screenshotSizes } from "@/features/projects/lib/screenshot-sizes";
import "@/features/home/styles/experience.css";

export function Hero() {
  return (
    <section className="studio-intro" aria-labelledby="intro-title">
      <HeroAtmosphere />
      <div className="container">
        <h1 id="intro-title">
          <span className="intro-line">Свяжем ваши сервисы.</span>
          <span className="intro-line">Автоматизируем рутину.</span>
          <span className="intro-line intro-gradient">Запустим ваш продукт.</span>
        </h1>
        <div className="intro-lower">
          <div className="intro-description">
            <p><ResponsiveCopy wide="Создаём сайты, Telegram-ботов и приложения под ваши рабочие задачи. Объединяем данные из разных источников и подключаем ИИ к документам и сервисам." compact="Сайты, Telegram-приложения и ИИ под ваши рабочие задачи." /></p>
            <p data-copy-wide="">Вы рассказываете, как устроена работа и что хотите изменить. Мы помогаем определить решение и доводим его до запуска.</p>
          </div>
          <div className="intro-actions">
            <ExternalLink className="button button-primary" href={site.contact}>
              Обсудить мою задачу
              <Icon name="diagonal" />
            </ExternalLink>
            <span>
              <ResponsiveCopy
                wide={<>
                  Напрямую с разработчиком.
                  <br />
                  Можно без технического задания.
                </>}
                compact="Можно без технического задания."
              />
            </span>
          </div>
        </div>
        <div className="workbench reveal" aria-label="Пример реализованного проекта">
          <div className="work-panels">
            <div className="work-panel">
              <div className="screen-viewport work-image-viewport" role="region" aria-label="Локальная система автомагазина"><div className="work-image-link screenshot-static"><Screenshot image={getScreenshot("/assets/autoparts-catalog.jpg")} alt="Концепция интерфейса каталога запчастей с поиском и остатками" sizes={screenshotSizes.cover} priority /></div></div>
              <div className="work-caption">
                <div><h2>Локальная система автомагазина</h2></div>
                <p>Связали каталог и склад. Подбор — в одном интерфейсе.</p>
                <Link href="/projects/autoparts/">
                  Подробнее
                  <Icon name="diagonal" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
