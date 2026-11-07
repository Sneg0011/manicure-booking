import { handleDailyCron } from '../../../../demo/cron';
import { getDeps } from '../../../../lib/deps';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return handleDailyCron(request, getDeps(), {
    CRON_SECRET: process.env.CRON_SECRET,
    DEMO_MODE: process.env.DEMO_MODE,
  });
}
