import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { masterServices, services } from '../../src/db/schema';
import { resetDemo } from '../../src/demo/reset';
import { getCatalog } from '../../src/site/catalog';
import { createTestDb } from '../helpers/db';
import { BASE_NOW, deps } from '../helpers/fixtures';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  fixture = await createTestDb();
  await resetDemo(deps(fixture.db, { current: BASE_NOW }));
});
afterEach(async () => fixture.close());

test('витрина группирует активные услуги по порядку и показывает цену и время каждого мастера', async () => {
  const catalog = await getCatalog(deps(fixture.db, { current: BASE_NOW }));
  expect(catalog.categories.map((group) => group.name)).toEqual(['Маникюр', 'Педикюр', 'Ремонт']);
  expect(catalog.categories.map((group) => group.services.map((item) => item.name))).toEqual([
    ['Без покрытия', 'С покрытием', 'Снятие и новое покрытие', 'Наращивание'],
    ['Педикюр с покрытием'],
    ['Ремонт одного ногтя'],
  ]);
  const coating = catalog.categories[0].services[1];
  const extension = catalog.categories[0].services[3];
  expect(coating.byMaster[1]).toMatchObject({ priceRub: 2600, durationMin: 105 });
  expect(coating.byMaster[2]).toMatchObject({ priceRub: 2900, durationMin: 105 });
  expect(extension.byMaster[1]).toMatchObject({ priceRub: 4200, durationMin: 165 });
  expect(extension.byMaster[2]).toMatchObject({ priceRub: 4800, durationMin: 195 });

  await fixture.db.delete(masterServices).where(eq(masterServices.serviceId, extension.id));
  await fixture.db.update(services).set({ isActive: false }).where(eq(services.id, coating.id));
  const changed = await getCatalog(deps(fixture.db, { current: BASE_NOW }));
  expect(changed.categories[0].services.map((item) => item.name)).toEqual([
    'Без покрытия',
    'Снятие и новое покрытие',
    'Наращивание',
  ]);
  expect(changed.categories[0].services[2].byMaster[1]).toBeNull();
  expect(changed.categories[0].services[2].byMaster[2]).toBeNull();
});
