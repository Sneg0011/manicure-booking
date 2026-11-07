import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="not-found">
      <h1>Запись больше не существует или ссылка неверна</h1>
      <Link className="button" href="/book">
        Записаться
      </Link>
    </main>
  );
}
