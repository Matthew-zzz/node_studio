"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="not-found marketing-error container" role="alert">
      <h1>Не удалось открыть страницу.</h1>
      <p>Попробуйте загрузить её ещё раз.</p>
      <div className="error-actions">
        <button type="button" className="button button-primary" onClick={reset}>Попробовать снова</button>
        <Link className="button button-outline" href="/">На главную</Link>
      </div>
    </main>
  );
}
