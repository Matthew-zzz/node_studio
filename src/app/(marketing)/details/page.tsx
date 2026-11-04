import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";
import { createMetadata } from "@/lib/metadata";
import "@/features/legal/styles/terms.css";

export const metadata: Metadata = createMetadata({
  title: "Реквизиты и контакты — Node Studio",
  description: "Сведения о владельце сайта и исполнителе Node Studio: ФИО, ИНН, статус НПД, адрес и контакты для обращений.",
  path: "/details/",
});

export default function DetailsPage() {
  return (
    <article className="container terms-page">
      <Link className="terms-back" href="/#main">← На главную</Link>
      <h1>Реквизиты и контакты</h1>
      <p className="terms-lead">Сведения о владельце сайта node-studio.ru и исполнителе услуг Node Studio.</p>
      <p className="terms-date">Обновлено 4 ноября 2026 года</p>

      <section>
        <h2>Владелец сайта и исполнитель</h2>
        <p>{site.operator.fullName}</p>
        <p>{`${site.operator.status}.`}</p>
        <p>{`ИНН: ${site.operator.inn}.`}</p>
        <p>{`Место нахождения и адрес: ${site.operator.address}.`}</p>
        <p>Node Studio — наименование, под которым исполнитель оказывает услуги.</p>
      </section>

      <section>
        <h2>Обращения и связь</h2>
        <p>
          Почта для вопросов по услугам, заказам, персональным данным и заявлений правообладателей:
          {" "}
          <a href={`mailto:${site.projectsEmail}`}>{site.projectsEmail}</a>
          .
        </p>
        <p>
          Телефон:
          {" "}
          <a href={`tel:${site.phone}`}>{site.phoneDisplay}</a>
          .
        </p>
        <p>
          Telegram:
          {" "}
          <a href={site.contact}>{site.handle}</a>
          .
        </p>
        <p>{`Время ответа: ${site.hours}. Переписка по заказам ведётся в Telegram или по электронной почте.`}</p>
      </section>

      <section>
        <h2>Документы и расчёты</h2>
        <p>
          Условия заказа, оплаты, приёмки и возврата изложены в
          {" "}
          <Link href="/terms/">публичной оферте</Link>
          . Конкретный состав работ, цена и сроки согласуются в ТЗ и смете. Реквизиты для оплаты сообщаются при оформлении конкретного заказа; после получения оплаты исполнитель формирует и передаёт чек НПД в установленном порядке.
        </p>
        <p>
          Порядок работы с обращениями и данными посетителей описан в
          {" "}
          <Link href="/privacy/">политике обработки персональных данных</Link>
          .
        </p>
      </section>
    </article>
  );
}
