import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { site } from "@/config/site";
import { serviceOfferings } from "@/features/services/data/services";
import { formatServicePrice, servicePricingNote } from "@/features/services/lib/pricing";
import type { ServiceOffering } from "@/features/services/model/types";
import { createMetadata } from "@/lib/metadata";
import styles from "./services.module.css";

export const metadata: Metadata = createMetadata({
  title: "Услуги и стоимость — Node Studio",
  description: "Разработка сайтов от 3 000 ₽, проектов с нуля от 10 000 ₽, Telegram-ботов от 2 500 ₽. Описание услуг, возможностей и условий расчёта стоимости.",
  path: "/services/",
});

const services = serviceOfferings.filter((service): service is ServiceOffering & { readonly priceFromRub: number } => service.priceFromRub !== undefined);

export default function ServicesPage() {
  return (
    <div className="home-landing">
      <article className={`container ${styles.page}`}>
        <Link className={styles.back} href="/#services">← На главную</Link>
        <header className={styles.intro}>
          <p className="eyebrow">Node Studio · Услуги</p>
          <h1>Услуги и стоимость.</h1>
          <p className={styles.lead}>Сайты, приложения и автоматизация под вашу задачу. Ниже — возможности каждого направления и ориентировочная стоимость в рублях.</p>
        </header>

        <div className={styles.note}>
          <p>{servicePricingNote}</p>
          <p>Сервер, домен, лицензии, API и сторонние сервисы оплачиваются отдельно, если иное не согласовано в смете.</p>
        </div>

        <div className={styles.catalog}>
          {services.map((service) => (
            <section className={styles.service} id={service.id} aria-labelledby={`service-title-${service.id}`} key={service.id}>
              <div className={styles.serviceHeading}>
                <h2 id={`service-title-${service.id}`}>{service.title}</h2>
                <p className={styles.price}>{formatServicePrice(service.priceFromRub)}</p>
              </div>
              <div className={styles.details}>
                <div>
                  <p>{service.description}</p>
                  <p className={styles.result}>{service.result}</p>
                </div>
                <div>
                  <h3>Возможности</h3>
                  <ul>
                    {service.tasks.map((task) => <li key={task}>{task}</li>)}
                  </ul>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className={styles.delivery}>
          <h2>Что получает заказчик</h2>
          <p>Исходный код и GitHub-репозиторий, работающий проект на инфраструктуре заказчика, инструкции по запуску и обновлению, доступы, резервную копию и запись демонстрации. Состав передачи определяется согласованным ТЗ.</p>
          <p>Объём работ, сроки, итоговую стоимость и порядок оплаты согласуем до начала разработки. Условия передачи, исправления ошибок, отказа от услуг и возврата указаны в публичной оферте.</p>
          <div className={styles.actions}>
            <ExternalLink className="button button-primary" href={site.contact}>
              Обсудить задачу
              <Icon name="diagonal" />
            </ExternalLink>
            <Link href="/terms/">Публичная оферта →</Link>
          </div>
        </section>
      </article>
    </div>
  );
}
