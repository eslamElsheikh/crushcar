'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, Eye, EyeOff, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Modal, V2SearchInput } from '@/components/v2/admin';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';

/* V2 admin FAQs — same list/toggle/reorder/CRUD APIs as V1. */

interface Faq {
  id: string;
  questionAr: string; questionEn: string;
  answerAr: string; answerEn: string;
  isActive: boolean;
}

const blank = { questionAr: '', questionEn: '', answerAr: '', answerEn: '' };

export default function AdminFaqs() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async (all: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/faqs?all=${all ? '1' : '0'}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setFaqs(Array.isArray(data) ? data : data.data || []);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(showAll); }, [load, showAll]);

  const visible = faqs.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (f.questionAr + f.questionEn + f.answerAr + f.answerEn).toLowerCase().includes(q);
  });

  function openCreate() {
    setEditing(null);
    setForm(blank);
    setModal(true);
  }
  function openEdit(f: Faq) {
    setEditing(f);
    setForm({ questionAr: f.questionAr, questionEn: f.questionEn, answerAr: f.answerAr, answerEn: f.answerEn });
    setModal(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/faqs/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(form),
          })
        : await fetch('/api/faqs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(form),
          });
      if (res.ok) {
        setModal(false);
        setEditing(null);
        setForm(blank);
        load(showAll);
        toast.success(t('common.success'));
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/faqs/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) setFaqs((prev) => prev.filter((f) => f.id !== id));
      else toast.error(t('common.error'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setDeleting(null);
    }
  }

  async function toggle(f: Faq) {
    try {
      const res = await fetch(`/api/faqs/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !f.isActive }),
      });
      if (res.ok) setFaqs((prev) => prev.map((x) => (x.id === f.id ? { ...x, isActive: !x.isActive } : x)));
    } catch { /* keep state */ }
  }

  async function reorder(f: Faq, direction: 'up' | 'down') {
    try {
      const res = await fetch(`/api/faqs/${f.id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (res.ok) load(showAll);
    } catch { /* keep order */ }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch('/api/faqs/seed', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          data.seeded
            ? (isRTL ? 'تم إضافة الأسئلة الافتراضية بنجاح' : 'Default FAQs seeded successfully')
            : (isRTL ? 'الأسئلة الافتراضية موجودة بالفعل' : 'FAQs already seeded')
        );
        load(showAll);
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div>
      <V2PageHeader
        title={t('nav.faq')}
        sub={t('faq.manage')}
        action={
          <>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-[14px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {isRTL ? 'الأسئلة الافتراضية' : 'Seed Defaults'}
            </button>
            <button
              onClick={() => setShowAll(!showAll)}
              aria-pressed={showAll}
              className={cn('rounded-xl border px-4 py-3 text-[14px] font-bold transition', showAll ? 'border-[#1D5BD8]/30 bg-[#EFF4FF] text-[#1D5BD8]' : 'border-slate-200 bg-[var(--sp-card)] text-[var(--sp-text-muted)]')}
            >
              {isRTL ? 'عرض الكل' : 'Show all'}
            </button>
            <V2Button onClick={openCreate}>
              <Plus className="size-5" /> {isRTL ? 'سؤال جديد' : 'New FAQ'}
            </V2Button>
          </>
        }
      />

      <div className="mt-4 max-w-sm">
        <V2SearchInput value={search} onChange={setSearch} placeholder={t('bookings.search')} />
      </div>

      <div className="mt-4 grid gap-3">
        {loading ? (
          <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-10 text-center text-[14.5px] text-[var(--sp-text-muted)]" role="status">
            {t('common.loading')}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-[var(--sp-card)] p-10 text-center">
            <p className="text-[15.5px] font-extrabold text-[#0B1B33]">{t('faq.noFaqs')}</p>
            <p className="mt-1 text-[13.5px] text-[var(--sp-text-muted)]">{t('faq.addFirst')}</p>
          </div>
        ) : (
          visible.map((f) => (
            <div key={f.id} className={cn('rounded-2xl border bg-[var(--sp-card)] p-5 transition', f.isActive ? 'border-[var(--sp-line)]' : 'opacity-60')}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] font-extrabold text-[#0B1B33]">{isRTL ? f.questionAr : f.questionEn}</p>
                  <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-[var(--sp-text-muted)]">
                    {isRTL ? f.answerAr : f.answerEn}
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold', f.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                  {f.isActive ? t('faq.active') : t('faq.inactive')}
                </span>
              </div>
              <div className="mt-3.5 flex items-center gap-1 border-t border-slate-100 pt-3">
                <button onClick={() => reorder(f, 'up')} aria-label="Move up" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-slate-100">
                  <ArrowUp className="size-4" />
                </button>
                <button onClick={() => reorder(f, 'down')} aria-label="Move down" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-slate-100">
                  <ArrowDown className="size-4" />
                </button>
                <button onClick={() => toggle(f)} aria-label="Toggle active" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-slate-100">
                  {f.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <span className="ms-auto flex gap-1">
                  <button onClick={() => openEdit(f)} aria-label="Edit" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-slate-100 hover:text-[#0B1B33]">
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => remove(f.id)} disabled={deleting === f.id}
                    aria-label="Delete"
                    className="grid size-9 place-items-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting === f.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <V2Modal open={modal} onClose={() => setModal(false)} title={editing ? t('faq.editQuestion') : t('faq.addQuestion')} wide>
        <form onSubmit={save} className="grid gap-3.5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <V2Field label={t('faq.questionAr')}>
              <V2Input value={form.questionAr} onChange={(e) => setForm({ ...form, questionAr: e.target.value })} required />
            </V2Field>
            <V2Field label={t('faq.questionEn')}>
              <V2Input value={form.questionEn} onChange={(e) => setForm({ ...form, questionEn: e.target.value })} required dir="ltr" />
            </V2Field>
          </div>
          <V2Field label={t('faq.answerAr')}>
            <textarea value={form.answerAr} onChange={(e) => setForm({ ...form, answerAr: e.target.value })} required rows={3} className="v2-input min-h-[88px] resize-none py-3 text-[14.5px]" />
          </V2Field>
          <V2Field label={t('faq.answerEn')}>
            <textarea value={form.answerEn} onChange={(e) => setForm({ ...form, answerEn: e.target.value })} required dir="ltr" rows={3} className="v2-input min-h-[88px] resize-none py-3 text-[14.5px]" />
          </V2Field>
          <V2Button type="submit" size="lg" disabled={saving} className="w-full sm:w-auto">
            {saving && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
          </V2Button>
        </form>
      </V2Modal>
    </div>
  );
}
