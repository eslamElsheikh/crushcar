import { NextResponse } from 'next/server';
import { autoTransitionAllTrips } from '@/lib/trips';
import { autoExpireUnpaidBookings, autoExpireUnpaidCompanyBookings } from '@/lib/booking-expiry';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await auth();
    const headersList = await headers();
    const cronKey = headersList.get('x-cron-key');

    // A key that is not configured must not be comparable to anything. The
    // old check compared the header against undefined, which is only safe by
    // accident; refuse outright when the secret is missing.
    const configuredKey = process.env.JOB_CRON_KEY;
    const isValidCron = !!configuredKey && !!cronKey && cronKey === configuredKey;
    const isValidAdmin = session?.user?.role === 'SUPER_ADMIN';

    if (!isValidCron && !isValidAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await autoTransitionAllTrips();
    const expiredBookings = await autoExpireUnpaidBookings();
    const expiredCompanyBookings = await autoExpireUnpaidCompanyBookings();

    // Recorded only when the cron called it, not when a page load happened to
    // trigger the sweep. That is what lets the dashboard tell "the cron is
    // working" from "someone opened a trip page".
    if (isValidCron) {
      await prisma.siteSetting
        .upsert({
          where: { key: 'lastCronRunAt' },
          create: { key: 'lastCronRunAt', value: new Date().toISOString() },
          update: { value: new Date().toISOString() },
        })
        .catch(() => {});
    }

    return NextResponse.json({ ok: true, expiredBookings, expiredCompanyBookings });
  } catch (err) {
    console.error('[Jobs Transition]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
