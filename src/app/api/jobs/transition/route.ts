import { NextResponse } from 'next/server';
import { autoTransitionAllTrips } from '@/lib/trips';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await auth();
    const headersList = await headers();
    const cronKey = headersList.get('x-cron-key');

    const isValidCron = cronKey && cronKey === process.env.JOB_CRON_KEY;
    const isValidAdmin = session?.user?.role === 'SUPER_ADMIN';

    if (!isValidCron && !isValidAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await autoTransitionAllTrips();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Jobs Transition]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
