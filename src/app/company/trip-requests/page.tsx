'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Loader2, CalendarDays, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton, V2EmptyState } from '@/components/v2/ui';

/* V2 company trip requests — same list + POST API as V1. */

interface Station { id: string; name: string; city: string }

export default function CompanyTripRequestsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [requests, setRequests] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ fromStationId: '', toStationId: '', date: '', passengerCount: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/company/trip-requests', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.data || []);
      }
    } catch { /* keep empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/stations', { credentials: 'include' }).then((r) => r.json()).then((d) => setStations(d.stations || [])).catch(() => {});
  }, []);

  async function submit() {
    if (!form.fromStationId || !form.toStationId || !form.date || !form.passengerCount) {
      toast.error(isRTL ? 'أكمل كل الحقول المطلوبة' : 'Fill all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/company/trip-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fromStationId: form.fromStationId,
          toStationId: form.toStationId,
          date: form.date,
          passengerCount: Number(form.passengerCount),
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequests((prev) => [data.data || data, ...prev]);
        setModal(false);
        setForm({ fromStationId: '', toStationId: '', date: '', passengerCount: '', notes: '' });
        toast.success(t('tripRequest.success'));
      } else {
        toast.error(data.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[32px]">{t('company.tripRequests')}</h1>
          <p className="mt-1 text-[14.5px] text-[#5B6B84]">{t('tripRequest.title')}</p>
        </div>
        <V2Button onClick={() => setModal(true)}>
          <Plus className="size-5" /> {t('tripRequest.newRequest')}
        </V2Button>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="grid gap-3" role="status">
            <V2Skeleton className="h-28 rounded-2xl" />
            <V2Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : requests.length === 0 ? (
          <V2EmptyState
            title={t('tripRequest.noRequests')}
            actionLabel={t('tripRequest.newRequest')}
            onAction={() => setModal(true)}
          />
        ) : (
          <div className="grid gap-3">
            {requests.map((r: any) => (
              <div key={r.id} className="rounded-2xl border border-[#E6EBF2] bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <V2StatusBadge tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>
                    {r.status}
                  </V2StatusBadge>
                  <span className="ms-auto flex items-center gap-1.5 text-[13px] tabular-nums text-[#5B6B84]">
                    <Users className="size-4" /> {r.passengerCount}
                    <CalendarDays className="ms-2 size-4" />
                    {r.date && new Date(r.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <p className="mt-2.5 text-[15.5px] font-extrabold text-[#0B1B33]">
                  {isRTL
                    ? `${r.toStation?.name} ← ${r.fromStation?.name}`
                    : `${r.fromStation?.name} → ${r.toStation?.name}`}
                </p>
                {r.notes && <p className="mt-1 text-[13.5px] text-[#5B6B84]">{r.notes}</p>}
                {r.adminNotes && (
                  <p className="mt-2 rounded-xl bg-[#F6F8FC] px-4 py-2.5 text-[13px] text-[#5B6B84]">
                    <strong className="text-[#0B1B33]">{t('tripRequest.adminNotes')}:</strong> {r.adminNotes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={t('tripRequest.newRequest')}>
            <div className="absolute inset-0 bg-[#0B1B33]/60" onClick={() => setModal(false)} />
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="relative max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-white p-6">
              <div className="flex items-center justify-between">
                <p className="text-[18px] font-extrabold text-[#0B1B33]">{t('tripRequest.newRequest')}</p>
                <button onClick={() => setModal(false)} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-4 grid gap-3.5">
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <V2Field label={t('tripRequest.from')}>
                    <V2Select value={form.fromStationId} onChange={(e) => setForm({ ...form, fromStationId: e.target.value })}>
                      <option value="">—</option>
                      {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </V2Select>
                  </V2Field>
                  <V2Field label={t('tripRequest.to')}>
                    <V2Select value={form.toStationId} onChange={(e) => setForm({ ...form, toStationId: e.target.value })}>
                      <option value="">—</option>
                      {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </V2Select>
                  </V2Field>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <V2Field label={t('tripRequest.date')}>
                    <V2Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="tabular-nums" />
                  </V2Field>
                  <V2Field label={t('tripRequest.passengerCount')}>
                    <V2Input type="number" min="1" value={form.passengerCount} onChange={(e) => setForm({ ...form, passengerCount: e.target.value })} dir="ltr" className="tabular-nums" />
                  </V2Field>
                </div>
                <V2Field label={t('tripRequest.notes')}>
                  <V2Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </V2Field>
              </div>
              <V2Button disabled={submitting} onClick={submit} size="lg" className="mt-5 w-full">
                {submitting && <Loader2 className="size-5 animate-spin" />} {t('tripRequest.submit')}
              </V2Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
