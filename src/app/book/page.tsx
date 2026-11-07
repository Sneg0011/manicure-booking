import Link from 'next/link';
import { getDeps } from '../../lib/deps';
import { getCatalog } from '../../site/catalog';
import { formatStudioDate } from '../../lib/time';
import { nextStudioDate } from '../../booking/rules';
import { getDemoVersion } from '../../demo/version';
import { BookingForm } from './booking-form';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Запись — Лунка' };
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const deps = getDeps();
  const [catalog, demoVersion] = await Promise.all([getCatalog(deps), getDemoVersion(deps)]);
  const params = await searchParams;
  const requested = Number(params.service);
  const serviceId = catalog.services.some((service) => service.id === requested) ? requested : null;
  const dates: string[] = [];
  for (let date = formatStudioDate(deps.now()), i = 0; i < 14; i++, date = nextStudioDate(date))
    dates.push(date);
  return (
    <>
      <div className="site-bar">
        <Link href="/">
          <b>лунка</b>
        </Link>
        <span>Демо: студия и записи вымышленные</span>
      </div>
      <BookingForm
        services={catalog.services.map(({ id, name, durationMin, priceRub }) => ({
          id,
          name,
          durationMin,
          priceRub,
        }))}
        masters={catalog.masters.map(({ id, name }) => ({ id, name }))}
        initialServiceId={serviceId}
        dates={dates}
        demoVersion={demoVersion}
      />
    </>
  );
}
