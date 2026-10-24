import Link from "next/link";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { site } from "@/config/site";
import { Faq } from "@/features/home/components/faq";
import { Process } from "@/features/home/components/process";
import { ProjectsSection } from "@/features/projects/components/projects-section";
import { serviceOfferings } from "@/features/services/data/services";
import { Contact } from "@/components/sections/contact";

function HomeHero() {
  return (
    <section className="landing-hero" aria-labelledby="intro-title">
      <div className="container">
        <p className="landing-kicker">
          Node Studio
          <span />
          {' '}
          Цифровая разработка
        </p>
        <h1 id="intro-title">
          Свяжем ваши сервисы.
          <br />
          Автоматизируем рутину.
          <br />
          <span>Запустим ваш продукт.</span>
        </h1>
        <div className="landing-hero-bottom">
          <p><ResponsiveCopy wide="Создаём сайты, Telegram-ботов и приложения под реальные рабочие задачи. Объединяем данные и подключаем ИИ к вашим процессам." compact="Сайты, Telegram-приложения и ИИ под рабочие задачи." /></p>
          <div className="landing-hero-action">
            <ExternalLink className="button button-primary" href={site.contact}>
              Обсудить задачу
              <Icon name="diagonal" />
            </ExternalLink>
            <span>
              Напрямую с разработчиком
              <br />
              Можно без технического задания
            </span>
          </div>
        </div>
        <Link className="landing-scroll" href="#projects">
          Избранные проекты
          <Icon name="arrow" />
        </Link>
      </div>
    </section>
  );
}

function HomeCapabilities() {
  return (
    <section className="landing-capabilities section" id="services" aria-labelledby="landing-services-title">
      <div className="container">
        <div className="section-head">
          <div>
            <p className="eyebrow">Чем помогаем</p>
            <h2 id="landing-services-title">От идеи до рабочего инструмента.</h2>
          </div>
          <p>Подключаемся к задаче на нужном этапе: проектируем решение, разрабатываем и доводим его до запуска.</p>
        </div>
        <div className="landing-capability-grid">
          {serviceOfferings.filter(service => service.id !== "individual").map((service, index) => (
            <article className="landing-capability" key={service.id}>
              <span className="landing-capability-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                {service.proof && (
                <Link href={service.proof.href}>
                  {service.proof.label}
                  <Icon name="diagonal" />
                </Link>
)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <div className="home-landing">
      <HomeHero />
      <ProjectsSection />
      <HomeCapabilities />
      <Process />
      <Faq />
      <Contact />
    </div>
  );
}
