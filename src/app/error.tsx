'use client';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="site-error" role="alert">
      <div className="site-error-inner">
        <span className="site-error-mark" aria-hidden="true">
          лунка
        </span>
        <h1>Сервис временно недоступен. Попробуйте обновить страницу.</h1>
        <button className="button" type="button" onClick={reset}>
          Повторить
        </button>
      </div>
    </main>
  );
}
