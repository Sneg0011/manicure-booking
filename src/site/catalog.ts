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
      byMaster: Object.fromEntries(
        allMasters.map((master) => {
          const link = prices.find(
            (price) => price.serviceId === service.id && price.masterId === master.id,
          );
          return [
            master.id,
            link
              ? {
                  priceRub: link.priceRub ?? service.priceRub,
                  durationMin: link.durationMin ?? service.durationMin,
                }
              : null,
          ];
        }),
      ) as Record<number, { priceRub: number; durationMin: number } | null>,
    })),
    masters: allMasters,
    get categories() {
      const order = ['Маникюр', 'Педикюр', 'Ремонт'];
      return [...new Set([...order, ...this.services.map((service) => service.category)])]
        .map((name) => ({
          name,
          services: this.services.filter((service) => service.category === name),
        }))
        .filter((group) => group.services.length > 0);
    },
  };
}
