import { getDeps } from '../../../../lib/deps';
import { listServicesForAdmin } from '../../../../admin/services';
import { updateServiceAction, setMasterOverrideAction } from '../../../actions/admin-settings';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const rows = await listServicesForAdmin(getDeps());
  return (
    <div className="admin-list-page">
      <p className="admin-eyebrow">Каталог</p>
      <h1>Услуги</h1>
      {params.error && (
        <p role="alert" className="admin-error">
          {params.error}
        </p>
      )}
      {params.saved && <p role="status">Сохранено</p>}
      {rows.map((row) => (
        <section key={row.id} className="admin-settings-section">
          <h2>
            {row.name} {!row.isActive && <small>скрыта</small>}
          </h2>
          <form action={updateServiceAction} className="admin-settings-form">
            <input type="hidden" name="id" value={row.id} />
            <label>
              Название
              <input name="name" defaultValue={row.name} required />
            </label>
            <label>
              Описание
              <textarea name="description" defaultValue={row.description || ''} />
            </label>
            <label>
              Категория
              <input name="category" defaultValue={row.category} />
            </label>
            <label>
              Длительность, минут
              <input type="number" name="durationMin" defaultValue={row.durationMin} step={5} />
            </label>
            <label>
              Пауза, минут
              <input type="number" name="bufferMin" defaultValue={row.bufferMin} step={5} />
            </label>
            <label>
              Цена, ₽<input type="number" name="priceRub" defaultValue={row.priceRub} />
            </label>
            <label>
              Порядок
              <input type="number" name="sort" defaultValue={row.sort} />
            </label>
            <label>
              <input type="checkbox" name="isActive" defaultChecked={row.isActive} /> Показывать
              услугу
            </label>
            <button type="submit">Сохранить услугу</button>
          </form>
          <h3>Значения мастеров</h3>
          {row.masters.map((master) => (
            <form
              key={master.masterId}
              action={setMasterOverrideAction}
              className="admin-inline-form"
            >
              <input type="hidden" name="masterId" value={master.masterId} />
              <input type="hidden" name="serviceId" value={row.id} />
              <strong>{master.masterName}</strong>
              <label>
                <input type="checkbox" name="offered" defaultChecked={master.offered} /> Делает
                услугу
              </label>
              <label>
                Длительность, минут
                <input
                  type="number"
                  name="durationMin"
                  step={5}
                  defaultValue={master.durationMin ?? ''}
                  placeholder={String(row.durationMin)}
                />
              </label>
              <label>
                Цена, ₽
                <input
                  type="number"
                  name="priceRub"
                  defaultValue={master.priceRub ?? ''}
                  placeholder={String(row.priceRub)}
                />
              </label>
              <button type="submit">Сохранить мастера</button>
            </form>
          ))}
        </section>
      ))}
    </div>
  );
}
