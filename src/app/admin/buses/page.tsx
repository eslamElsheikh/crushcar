'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Bus, Armchair } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table } from '@/components/v2/admin';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2Modal } from '@/components/v2/admin';
import { V2StatusBadge } from '@/components/v2/ui';

/* V2 buses — same list/create/delete APIs as V1. */

const busTypes = [
  { value: 'MINI_BUS', label: 'Mini Bus' },
  { value: 'COACH_BUS', label: 'Coach Bus' },
  { value: 'DOUBLE_DECKER', label: 'Double Decker' },
];

export default function AdminBuses() {
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [buses, setBuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'COACH_BUS' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/buses', { credentials: 'include' });
        if (res.ok) setBuses(await res.json());
      } catch { /* keep empty */ } finally { setLoading(false); }
    })();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/buses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: form.name, type: form.type, seatCount: 0 }),
      });
      const data = await res.json();
      if (res.ok) {
        setBuses((prev) => [...prev, data]);
        setForm({ name: '', type: 'COACH_BUS' });
        setModal(false);
        router.push(`/admin/buses/${data.id}/layout`);
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/buses/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) setBuses((prev) => prev.filter((b) => b.id !== id));
      else toast.error(t('common.error'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <V2PageHeader
        title={t('nav.buses')}
        sub={isRTL ? `${buses.length} باص` : `${buses.length} buses`}
        action={
          <V2Button onClick={() => setModal(true)}>
            <Plus className="size-5" /> {isRTL ? 'باص جديد' : 'New bus'}
          </V2Button>
        }
      />

      <div className="mt-5">
        <V2Table
          columns={[
            isRTL ? 'الباص' : 'Bus',
            isRTL ? 'النوع' : 'Type',
            isRTL ? 'المقاعد' : 'Seats',
            isRTL ? 'الشركة' : 'Company',
            '',
          ]}
          rows={buses}
          rowKey={(b) => b.id}
          loading={loading}
          emptyTitle={isRTL ? 'لا توجد باصات' : 'No buses yet'}
          renderCell={(b, i) => {
            const cells = [
              <span key="n" className="flex items-center gap-2.5 font-bold">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
                  <Bus className="size-5" />
                </span>
                {b.name}
              </span>,
              <span key="t" className="text-[#5B6B84]">{busTypes.find((x) => x.value === b.type)?.label || b.type}</span>,
              <span key="s" className="tabular-nums text-[#5B6B84]">
                {b.layout?.seats?.length ?? b.seatCount ?? 0}
              </span>,
              <span key="c" className="text-[#5B6B84]">{b.company?.name || '—'}</span>,
              <span key="a" className="flex justify-end gap-1">
                <button
                  onClick={() => router.push(`/admin/buses/${b.id}/layout`)}
                  className="grid size-10 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100 hover:text-[#0B1B33]"
                  aria-label="Layout"
                >
                  <Armchair className="size-5" />
                </button>
                <button
                  onClick={() => remove(b.id)}
                  disabled={deleting === b.id}
                  aria-label="Delete"
                  className="grid size-10 place-items-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === b.id ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
                </button>
              </span>,
            ];
            return cells[i];
          }}
          renderMobile={(b) => (
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
                  <Bus className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15.5px] font-extrabold text-[#0B1B33]">{b.name}</p>
                  <p className="text-[13px] tabular-nums text-[#5B6B84]">
                    {busTypes.find((x) => x.value === b.type)?.label || b.type} · {b.layout?.seats?.length ?? b.seatCount ?? 0}
                  </p>
                </div>
                <V2StatusBadge tone="slate">{b.company?.name || '—'}</V2StatusBadge>
              </div>
              <div className="mt-3 flex gap-1.5">
                <button onClick={() => router.push(`/admin/buses/${b.id}/layout`)} className="flex-1 rounded-xl bg-[#EFF4FF] py-2.5 text-[13.5px] font-bold text-[#1D5BD8]">
                  {isRTL ? 'التخطيط' : 'Layout'}
                </button>
                <button onClick={() => remove(b.id)} disabled={deleting === b.id} className="flex-1 rounded-xl bg-red-50 py-2.5 text-[13.5px] font-bold text-red-600 disabled:opacity-50">
                  {t('common.delete')}
                </button>
              </div>
            </div>
          )}
        />
      </div>

      <V2Modal open={modal} onClose={() => setModal(false)} title={isRTL ? 'باص جديد' : 'New bus'}>
        <form onSubmit={create} className="grid gap-3.5">
          <V2Field label={isRTL ? 'اسم الباص' : 'Bus name'}>
            <V2Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </V2Field>
          <V2Field label={isRTL ? 'النوع' : 'Type'}>
            <V2Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {busTypes.map((bt) => (
                <option key={bt.value} value={bt.value}>{bt.label}</option>
              ))}
            </V2Select>
          </V2Field>
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600">
              {error}
            </p>
          )}
          <V2Button type="submit" size="lg" disabled={saving} className="w-full">
            {saving && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
          </V2Button>
        </form>
      </V2Modal>
    </div>
  );
}
