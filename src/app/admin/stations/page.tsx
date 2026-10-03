'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table, V2Modal, V2SearchInput } from '@/components/v2/admin';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';

/* V2 admin stations — same list/create/update/delete APIs as V1. */

interface Station { id: string; name: string; city: string }

export default function AdminStations() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [form, setForm] = useState({ name: '', city: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (q: string, city: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stations?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStations(data.stations || []);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(search, cityFilter), search || cityFilter ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search, cityFilter]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', city: '' });
    setModal(true);
  }
  function openEdit(s: Station) {
    setEditing(s);
    setForm({ name: s.name, city: s.city });
    setModal(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.city) return;
    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/stations/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(form),
          })
        : await fetch('/api/stations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(form),
          });
      if (res.ok) {
        setModal(false);
        setEditing(null);
        setForm({ name: '', city: '' });
        load(search, cityFilter);
        toast.success(t('common.success'));
      } else {
        toast.error((await res.json()).error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Station) {
    setDeleting(s.id);
    try {
      const res = await fetch(`/api/stations/${s.id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setStations((prev) => prev.filter((x) => x.id !== s.id));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || (isRTL ? 'لا يمكن حذف المحطة' : 'Cannot delete station'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <V2PageHeader
        title={t('nav.stations')}
        sub={isRTL ? `${stations.length} محطة` : `${stations.length} stations`}
        action={
          <V2Button onClick={openCreate}>
            <Plus className="size-5" /> {isRTL ? 'محطة جديدة' : 'New station'}
          </V2Button>
        }
      />

      <div className="mt-4 grid max-w-xl gap-2.5 sm:grid-cols-2">
        <V2SearchInput value={search} onChange={(v) => setSearch(v)} placeholder={t('stations.searchPlaceholder')} />
        <V2Input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder={t('stations.filterByCity')} aria-label={t('stations.filterByCity')} />
      </div>

      <div className="mt-4">
        <V2Table
          columns={[isRTL ? 'المحطة' : 'Station', isRTL ? 'المدينة' : 'City', '']}
          rows={stations}
          rowKey={(s) => s.id}
          loading={loading}
          emptyTitle={t('stations.noStations')}
          renderCell={(s, i) => {
            const cells = [
              <span key="n" className="flex items-center gap-2.5 font-bold">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
                  <MapPin className="size-5" />
                </span>
                {s.name}
              </span>,
              <span key="c" className="text-[var(--sp-text-muted)]">{s.city}</span>,
              <span key="a" className="flex justify-end gap-1">
                <button onClick={() => openEdit(s)} aria-label="Edit" className="grid size-10 place-items-center rounded-xl text-[var(--sp-text-muted)] hover:bg-slate-100 hover:text-[#0B1B33]">
                  <Pencil className="size-5" />
                </button>
                <button
                  onClick={() => remove(s)} disabled={deleting === s.id}
                  aria-label="Delete"
                  className="grid size-10 place-items-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === s.id ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
                </button>
              </span>,
            ];
            return cells[i];
          }}
          renderMobile={(s) => (
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
                  <MapPin className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15.5px] font-extrabold text-[#0B1B33]">{s.name}</p>
                  <p className="text-[13px] text-[var(--sp-text-muted)]">{s.city}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                <button onClick={() => openEdit(s)} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[13.5px] font-bold text-[#0B1B33]">
                  {t('common.edit')}
                </button>
                <button onClick={() => remove(s)} disabled={deleting === s.id} className="flex-1 rounded-xl bg-red-50 py-2.5 text-[13.5px] font-bold text-red-600 disabled:opacity-50">
                  {t('common.delete')}
                </button>
              </div>
            </div>
          )}
        />
      </div>

      <V2Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? (isRTL ? 'تعديل المحطة' : 'Edit station') : (isRTL ? 'محطة جديدة' : 'New station')}>
        <form onSubmit={save} className="grid gap-3.5">
          <V2Field label={isRTL ? 'اسم المحطة' : 'Station name'}>
            <V2Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </V2Field>
          <V2Field label={isRTL ? 'المدينة' : 'City'}>
            <V2Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
          </V2Field>
          <V2Button type="submit" size="lg" disabled={saving} className="w-full">
            {saving && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
          </V2Button>
        </form>
      </V2Modal>
    </div>
  );
}
