import { asc, and, eq } from 'drizzle-orm';
import type { Deps } from '../booking/types';
import { masters, masterServices, services } from '../db/schema';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });
const valid = (n: number, min: number, max: number, step = 1) =>
  Number.isInteger(n) && n >= min && n <= max && n % step === 0;
export type ServiceUpdate = {
  name: string;
  description: string | null;
  category: string;
  durationMin: number;
  bufferMin: number;
  priceRub: number;
  isActive: boolean;
  sort: number;
};

export async function listServicesForAdmin(deps: Deps) {
  const [all, masterRows, assignments] = await Promise.all([
    deps.db.select().from(services).orderBy(asc(services.sort), asc(services.id)),
    deps.db.select({ id: masters.id, name: masters.name }).from(masters).orderBy(asc(masters.sort)),
    deps.db.select().from(masterServices),
  ]);
  return all.map((service) => ({
    ...service,
    masters: masterRows.map((master) => {
      const assignment = assignments.find(
        (x) => x.masterId === master.id && x.serviceId === service.id,
      );
      return {
        masterId: master.id,
        masterName: master.name,
        offered: !!assignment,
        durationMin: assignment?.durationMin ?? null,
        priceRub: assignment?.priceRub ?? null,
      };
    }),
  }));
}

export async function updateService(
  deps: Deps,
  id: number,
  input: ServiceUpdate,
): Promise<Result<null>> {
  if (!Number.isSafeInteger(id) || id <= 0) return fail('Услуга не найдена');
  if (input.name.trim().length < 2 || input.name.trim().length > 80)
    return fail('Название: от 2 до 80 символов');
  if (!valid(input.durationMin, 5, 600, 5))
    return fail('Длительность: от 5 до 600 минут, кратно 5');
  if (!valid(input.bufferMin, 0, 120, 5)) return fail('Пауза: от 0 до 120 минут, кратно 5');
  if (!valid(input.priceRub, 0, 1000000)) return fail('Цена: целое число от 0 до 1000000 рублей');
  if (!Number.isInteger(input.sort) || typeof input.isActive !== 'boolean')
    return fail('Неверный порядок или видимость');
  const rows = await deps.db
    .update(services)
    .set({ ...input, name: input.name.trim(), category: input.category.trim() || 'Маникюр' })
    .where(eq(services.id, id))
    .returning({ id: services.id });
  return rows.length ? { ok: true, value: null } : fail('Услуга не найдена');
}

export async function setMasterOverride(
  deps: Deps,
  masterId: number,
  serviceId: number,
  values: { durationMin: number | null; priceRub: number | null },
  offered: boolean,
): Promise<Result<null>> {
  if (
    !Number.isSafeInteger(masterId) ||
    !Number.isSafeInteger(serviceId) ||
    masterId <= 0 ||
    serviceId <= 0
  )
    return fail('Мастер или услуга не найдены');
  if (values.durationMin !== null && !valid(values.durationMin, 5, 600, 5))
    return fail('Длительность мастера: от 5 до 600 минут, кратно 5');
  if (values.priceRub !== null && !valid(values.priceRub, 0, 1000000))
    return fail('Цена мастера: целое число от 0 до 1000000 рублей');
  const [master, service] = await Promise.all([
    deps.db.select({ id: masters.id }).from(masters).where(eq(masters.id, masterId)),
    deps.db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)),
  ]);
  if (!master.length || !service.length) return fail('Мастер или услуга не найдены');
  if (!offered)
    await deps.db
      .delete(masterServices)
      .where(and(eq(masterServices.masterId, masterId), eq(masterServices.serviceId, serviceId)));
  else
    await deps.db
      .insert(masterServices)
      .values({ masterId, serviceId, ...values })
      .onConflictDoUpdate({
        target: [masterServices.masterId, masterServices.serviceId],
        set: values,
      });
  return { ok: true, value: null };
}
