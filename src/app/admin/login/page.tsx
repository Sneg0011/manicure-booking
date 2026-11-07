import { loginAction } from '../../actions/admin';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const error = (await searchParams).error;
  return (
    <main className="admin-login">
      <p className="admin-brand">Лунка / управление записью</p>
      <h1>Вход менеджера</h1>
      <form action={loginAction}>
        <label htmlFor="manager-login">Логин</label>
        <input id="manager-login" name="login" autoComplete="username" required />
        <label htmlFor="manager-password">Пароль</label>
        <input
          id="manager-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {error === 'Слишком много попыток, попробуйте позже' ||
        error === 'Неверный логин или пароль' ? (
          <p role="alert" className="admin-error">
            {error}
          </p>
        ) : null}
        <button type="submit">Войти</button>
      </form>
    </main>
  );
}
