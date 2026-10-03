'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, Eye, EyeOff, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Modal } from '@/components/v2/admin';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2EmptyState, V2Skeleton } from '@/components/v2/ui';

/* V2 admin destinations — same CRUD + upload APIs, SUPER_ADMIN only. */

interface Destination {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

const blank = { slug: '', nameAr: '', nameEn: '' };

export default function AdminDestinations() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [items, setItems] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Destination | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Destination | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/destinations', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.data) ? data.data : []);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(blank);
    setPendingImage(null);
    setModal(true);
  }
  function openEdit(d: Destination) {
    setEditing(d);
    setForm({ slug: d.slug, nameAr: d.nameAr, nameEn: d.nameEn || '' });
    setPendingImage(d.imageUrl);
    setModal(true);
  }

  async function uploadFile(f: File): Promise<string | null> {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', f);
      const res = await fetch('/api/admin/destinations/upload', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('common.error'));
        return null;
      }
      return data.url as string;
    } catch {
      toast.error(t('common.error'));
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.slug.trim() || !form.nameAr.trim()) {
      toast.error(isRTL ? 'المعرف والاسم بالعربية مطلوبان' : 'Slug and Arabic name are required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || null,
      };
      if (!editing) {
        payload.slug = form.slug.trim().toLowerCase();
      }
      if (pendingImage !== (editing?.imageUrl || null)) {
        payload.imageUrl = pendingImage;
      }
      const res = editing
        ? await fetch(`/api/admin/destinations/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/destinations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('common.error'));
        return;
      }
      setModal(false);
      setEditing(null);
      setForm(blank);
      setPendingImage(null);
      load();
      toast.success(t('common.success'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function move(d: Destination, dir: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = sorted.findIndex((x) => x.id === d.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    setBusy(d.id);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/admin/destinations/${d.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ sortOrder: other.sortOrder }),
        }),
        fetch(`/api/admin/destinations/${other.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ sortOrder: d.sortOrder }),
        }),
      ]);
      if (r1.ok && r2.ok) load();
      else toast.error(t('common.error'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(d: Destination) {
    try {
      const res = await fetch(`/api/admin/destinations/${d.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ isActive: !d.isActive }),
      });
      if (res.ok) setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, isActive: !x.isActive } : x)));
    } catch { /* keep state */ }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(deleting.id);
    try {
      const res = await fetch(`/api/admin/destinations/${deleting.id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.id !== deleting.id));
        setDeleting(null);
        toast.success(t('common.success'));
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <V2PageHeader
        title={isRTL ? 'الوجهات' : 'Destinations'}
        sub={isRTL ? `${items.length} وجهات` : `${items.length} destinations`}
        action={
          <V2Button onClick={openCreate}>
            <Plus className="size-5" /> {isRTL ? 'وجهة جديدة' : 'New destination'}
          </V2Button>
        }
      />

      <div className="mt-5">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2" role="status">
            {[0, 1, 2, 3].map((i) => (
              <V2Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <V2EmptyState
            title={isRTL ? 'لا توجد وجهات بعد' : 'No destinations yet'}
            desc={isRTL ? 'أضف أول وجهة لتظهر في الصفحة الرئيسية.' : 'Add the first destination to show it on the homepage.'}
            actionLabel={isRTL ? 'إضافة وجهة' : 'Add destination'}
            onAction={openCreate}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((d) => (
              <div key={d.id} className={cn('flex gap-3.5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-4', !d.isActive && 'opacity-60')}>
                <span className="relative block h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-[#0A1E3C]">
                  {d.imageUrl ? (
                    <Image src={d.imageUrl} alt={d.nameAr} fill sizes="112px" className="object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center px-2 text-center text-[12px] font-bold text-white">{d.nameAr}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#0B1B33]">{d.nameAr}</p>
                    <V2StatusBadge tone={d.isActive ? 'green' : 'slate'}>
                      {d.isActive ? (isRTL ? 'ظاهرة' : 'Visible') : (isRTL ? 'مخفية' : 'Hidden')}
                    </V2StatusBadge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[12px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>
                    {d.slug} · #{d.sortOrder}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <button onClick={() => move(d, -1)} disabled={busy === d.id} aria-label="Move up" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-slate-100 disabled:opacity-40">
                      <ArrowUp className="size-4" />
                    </button>
                    <button onClick={() => move(d, 1)} disabled={busy === d.id} aria-label="Move down" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-slate-100 disabled:opacity-40">
                      <ArrowDown className="size-4" />
                    </button>
                    <button onClick={() => toggleActive(d)} aria-label="Toggle visibility" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-slate-100">
                      {d.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                    <span className="ms-auto flex gap-1">
                      <button onClick={() => openEdit(d)} aria-label="Edit" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-slate-100 hover:text-[#0B1B33]">
                        <Pencil className="size-4" />
                      </button>
                      <button onClick={() => setDeleting(d)} aria-label="Delete" className="grid size-9 place-items-center rounded-lg text-red-500 hover:bg-red-50">
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <V2Modal open={modal} onClose={() => setModal(false)} title={editing ? (isRTL ? 'تعديل الوجهة' : 'Edit destination') : (isRTL ? 'وجهة جديدة' : 'New destination')}>
        <form onSubmit={save} className="grid gap-3.5">
          {!editing && (
            <V2Field label={isRTL ? 'المعرف (إنجليزي، بدون مسافات)' : 'Slug (english, no spaces)'}>
              <V2Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required dir="ltr" placeholder="aswan" className="font-mono" />
            </V2Field>
          )}
          <div className="grid gap-3.5 sm:grid-cols-2">
            <V2Field label={isRTL ? 'الاسم بالعربية *' : 'Arabic name *'}>
              <V2Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
            </V2Field>
            <V2Field label={isRTL ? 'الاسم بالإنجليزية' : 'English name'}>
              <V2Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} dir="ltr" />
            </V2Field>
          </div>
          <div>
            <p className="px-1 text-[13px] font-bold text-[#0B1B33]">{isRTL ? 'الصورة' : 'Image'}</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="relative block h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-[#0A1E3C]">
                {pendingImage ? (
                  <Image src={pendingImage} alt="" fill sizes="112px" className="object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-[11px] font-bold text-white/70">{isRTL ? 'بدون صورة' : 'No image'}</span>
                )}
              </span>
              <span className="grid gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#EFF4FF] px-4 py-2.5 text-[13.5px] font-bold text-[#1D5BD8] hover:bg-[#1D5BD8] hover:text-white">
                  <ImagePlus className="size-4" />
                  {uploading ? (isRTL ? 'جاري الرفع...' : 'Uploading...') : (isRTL ? 'رفع صورة' : 'Upload')}
                  <input
                    type="file" accept=".jpg,.jpeg,.png,.webp" className="sr-only"
                    disabled={uploading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const url = await uploadFile(f);
                      if (url) setPendingImage(url);
                      e.target.value = '';
                    }}
                  />
                </label>
                {pendingImage && (
                  <button type="button" onClick={() => setPendingImage(null)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2.5 text-[13.5px] font-bold text-[var(--sp-text-muted)] hover:bg-slate-200">
                    <X className="size-4" /> {isRTL ? 'إزالة' : 'Remove'}
                  </button>
                )}
              </span>
            </div>
            <p className="mt-1.5 px-1 text-[12px] text-[var(--sp-text-muted)]">JPEG/PNG/WebP · {isRTL ? 'حتى 5MB' : 'up to 5MB'}</p>
          </div>
          <V2Button type="submit" size="lg" disabled={saving || uploading} className="w-full">
            {t('common.save')}
          </V2Button>
        </form>
      </V2Modal>

      <V2Modal open={!!deleting} onClose={() => setDeleting(null)} title={isRTL ? 'حذف الوجهة' : 'Delete destination'}>
        <p className="text-[14.5px] text-[var(--sp-text-muted)]">
          {isRTL ? `حذف "${deleting?.nameAr}" نهائيًا؟` : `Delete "${deleting?.nameAr}" permanently?`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button onClick={() => setDeleting(null)} className="rounded-xl bg-slate-100 py-3.5 text-[14.5px] font-bold text-[#0B1B33]">
            {t('common.cancel')}
          </button>
          <button
            onClick={remove}
            disabled={busy !== null}
            className="rounded-xl bg-red-600 py-3.5 text-[14.5px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {t('common.delete')}
          </button>
        </div>
      </V2Modal>
    </div>
  );
}
