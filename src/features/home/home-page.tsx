import Link from "next/link";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { site } from "@/config/site";
import { Faq } from "@/features/home/components/faq";
import { LandingServiceCards } from "@/features/home/components/landing-service-cards";
import { Process } from "@/features/home/components/process";
import { ProjectsSection } from "@/features/projects/components/projects-section";
import { Contact } from "@/components/sections/contact";

function HomeHero() {
  return (
    <section className="landing-hero" aria-labelledby="intro-title">
      <h1 className="sr-only" id="intro-title">
        Свяжем ваши сервисы. Автоматизируем рутину. Запустим ваш продукт.
      </h1>
      <video
        className="landing-hero-video"
        src="/assets/node-studio-home-hero.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="container">
        <div className="landing-hero-bottom">
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
        <LandingServiceCards />
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
