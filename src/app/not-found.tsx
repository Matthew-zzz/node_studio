import Link from "next/link";

export default function NotFound() {
  return (
    <div className="not-found container">
      <span className="eyebrow">404 / СТРАНИЦА НЕ НАЙДЕНА</span>
      <h1>
        Кажется, здесь
        <br />
        ещё ничего нет.
      </h1>
      <p>Зато на главной уже есть работающие проекты.</p>
      <Link className="button button-primary" href="/">Вернуться на главную →</Link>
    </div>
  );
}
