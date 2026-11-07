import type { Metadata } from 'next';
import { Pill } from './pill';

export const metadata: Metadata = { title: 'Страница не найдена — Лунка' };

export default function NotFound() {
  return (
    <main className="not-found">
      <h1>Такой страницы нет</h1>
      <p>Возможно, ссылка устарела или в ней опечатка</p>
      <div className="not-found-links">
        <Pill href="/">На главную</Pill>
        <Pill href="/book" rose>
          Записаться
        </Pill>
      </div>
    </main>
  );
}
