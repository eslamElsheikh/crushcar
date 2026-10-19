import { prisma } from './prisma';

/**
 * When the scheduled job last ran.
 *
 * Recorded by the job endpoint, and only when the request carried the cron
 * header. A page load that happens to trigger the same sweep does not update
 * it, so this answers "is the schedule working" rather than "has anything
 * run recently".
 */
export const CRON_STALE_MINUTES = 15;

export async function lastCronRunMinutesAgo(now = new Date()): Promise<number | null> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: 'lastCronRunAt' } });
    if (!row?.value) return null;
    const at = new Date(row.value);
    if (Number.isNaN(at.getTime())) return null;
    return Math.max(0, Math.round((now.getTime() - at.getTime()) / 60000));
  } catch {
    return null;
  }
}

/**
 * Whether the schedule looks like it has stopped.
 *
 * Unpaid bookings are only released by this job, so a schedule that silently
 * died means seats stay held. The dashboard says so rather than leaving it to
 * be discovered.
 */
export async function isCronStale(now = new Date()): Promise<boolean> {
  const minutes = await lastCronRunMinutesAgo(now);
  if (minutes === null) return true;
  return minutes > CRON_STALE_MINUTES;
}
