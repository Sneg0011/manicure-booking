'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { managerAction } from '../../auth/session';
import { getDeps } from '../../lib/deps';
import { fromStudioTime } from '../../lib/time';
import { addClosure, removeClosure, setRules, setWorkingHours } from '../../admin/schedule';
import { setMasterOverride, updateService } from '../../admin/services';

const num = (form: FormData, key: string) => Number(form.get(key));
function finish(
  path: string,
  result: { ok: boolean; error?: string },
  extra?: Record<string, string>,
): never {
  revalidatePath(path);
  const params = new URLSearchParams(extra);
  if (!result.ok) params.set('error', result.error || 'Не удалось сохранить');
  else params.set('saved', '1');
  redirect(`${path}?${params}`);
}
const hours = managerAction(async (form: FormData) => {
  const opens = String(form.get('opens') || '');
  const closes = String(form.get('closes') || '');
  const result = await setWorkingHours(
    getDeps(),
    num(form, 'masterId'),
    num(form, 'weekday'),
    form.get('off') === 'on' ? null : { opens, closes },
  );
  finish('/admin/schedule', result);
});
export async function setHoursAction(form: FormData) {
  return hours(form);
}

const closure = managerAction(async (form: FormData) => {
  const startDate = String(form.get('startDate') || '');
  const endDate = String(form.get('endDate') || startDate);
  const startTime = String(form.get('startTime') || '00:00');
  const endTime = String(form.get('endTime') || '00:00');
  const wholeDay = !form.get('startTime') && !form.get('endTime');
  const end = wholeDay ? fromStudioTime(endDate, '00:00') : fromStudioTime(endDate, endTime);
  if (wholeDay) end.setTime(end.getTime() + 24 * 60 * 60_000);
  const result =
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)
      ? await addClosure(getDeps(), {
          masterId: num(form, 'masterId'),
          startsAt: fromStudioTime(startDate, startTime),
          endsAt: end,
          reason: String(form.get('reason') || ''),
        })
      : { ok: false as const, error: 'Укажите корректные дату и время' };
  finish(
    '/admin/schedule',
    result,
    result.ok ? { conflicts: String(result.value.conflicts) } : undefined,
  );
});
export async function addClosureAction(form: FormData) {
  return closure(form);
}

const remove = managerAction(async (form: FormData) =>
  finish('/admin/schedule', await removeClosure(getDeps(), num(form, 'id'))),
);
export async function removeClosureAction(form: FormData) {
  return remove(form);
}

const rules = managerAction(async (form: FormData) =>
  finish(
    '/admin/schedule',
    await setRules(getDeps(), {
      slotStepMin: num(form, 'slotStepMin'),
      minLeadMin: num(form, 'minLeadMin'),
      horizonDays: num(form, 'horizonDays'),
      changeCutoffMin: num(form, 'changeCutoffMin'),
      maxClientMoves: num(form, 'maxClientMoves'),
    }),
  ),
);
export async function setRulesAction(form: FormData) {
  return rules(form);
}

const service = managerAction(async (form: FormData) =>
  finish(
    '/admin/services',
    await updateService(getDeps(), num(form, 'id'), {
      name: String(form.get('name') || ''),
      description: String(form.get('description') || ''),
      category: String(form.get('category') || ''),
      durationMin: num(form, 'durationMin'),
      bufferMin: num(form, 'bufferMin'),
      priceRub: num(form, 'priceRub'),
      isActive: form.get('isActive') === 'on',
      sort: num(form, 'sort'),
    }),
  ),
);
export async function updateServiceAction(form: FormData) {
  return service(form);
}

const override = managerAction(async (form: FormData) =>
  finish(
    '/admin/services',
    await setMasterOverride(
      getDeps(),
      num(form, 'masterId'),
      num(form, 'serviceId'),
      {
        durationMin: form.get('durationMin') ? num(form, 'durationMin') : null,
        priceRub: form.get('priceRub') ? num(form, 'priceRub') : null,
      },
      form.get('offered') === 'on',
    ),
  ),
);
export async function setMasterOverrideAction(form: FormData) {
  return override(form);
}
