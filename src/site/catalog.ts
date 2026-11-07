import { asc, eq } from 'drizzle-orm';
import { masters, masterServices, services } from '../db/schema';
import type { Deps } from '../booking/types';

export async function getCatalog(deps: Deps) {
  const [allServices, allMasters, prices] = await Promise.all([
    deps.db
      .select()
      .from(services)
      .where(eq(services.isActive, true))
      .orderBy(asc(services.sort), asc(services.id)),
    deps.db
      .select()
      .from(masters)
      .where(eq(masters.isActive, true))
      .orderBy(asc(masters.sort), asc(masters.id)),
    deps.db.select().from(masterServices),
  ]);
  return {
    services: allServices.map((service) => ({
      ...service,
      variedPrice: prices.some(
        (p) => p.serviceId === service.id && p.priceRub !== null && p.priceRub !== service.priceRub,
      ),
    })),
    masters: allMasters,
  };
}
