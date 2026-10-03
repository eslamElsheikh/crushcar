'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Clock, Loader2, Check, Settings2, Sparkles, Building2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { cn } from '@/lib/utils';
import { V2Button } from '@/components/v2/Button';

export default function AdminSettingsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [expiryHours, setExpiryHours] = useState('6');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedExpiry, setSavedExpiry] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        setRegistrationEnabled(data.individualRegistrationEnabled !== 'false');
        if (data.companyBookingExpiryHours) {
          setExpiryHours(data.companyBookingExpiryHours);
        }
      } else {
        toast.error(isRTL ? 'تعذر تحميل الإعدادات' : 'Failed to load settings');
      }
    } catch {
      toast.error(isRTL ? 'خطأ في الاتصال بالخادم' : 'Server connection error');
    } finally {
      setLoading(false);
    }
  }

  async function toggleRegistration() {
    const newValue = !registrationEnabled;
    setSaving('registration');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'individualRegistrationEnabled',
          value: newValue ? 'true' : 'false',
        }),
      });
      if (res.ok) {
        setRegistrationEnabled(newValue);
        toast.success(
          newValue
            ? isRTL ? 'تم تفعيل تسجيل الأفراد بنجاح' : 'Individual registration enabled'
            : isRTL ? 'تم تعطيل تسجيل الأفراد' : 'Individual registration disabled'
        );
      } else {
        toast.error(isRTL ? 'فشل تحديث الإعداد' : 'Failed to update setting');
      }
    } catch {
      toast.error(isRTL ? 'خطأ في الاتصال' : 'Connection error');
    } finally {
      setSaving(null);
    }
  }

  async function saveExpiry() {
    const h = parseInt(expiryHours, 10);
    if (isNaN(h) || h < 1 || h > 168) {
      toast.error(isRTL ? 'الرجاء إدخال عدد ساعات صحيح (1 - 168)' : 'Please enter valid hours (1 - 168)');
      return;
    }

    setSaving('expiry');
    setSavedExpiry(false);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'companyBookingExpiryHours',
          value: String(h),
        }),
      });
      if (res.ok) {
        setSavedExpiry(true);
        toast.success(isRTL ? 'تم حفظ صلاحية الحجز' : 'Booking expiry updated');
        setTimeout(() => setSavedExpiry(false), 3000);
      } else {
        toast.error(isRTL ? 'فشل حفظ التعديل' : 'Failed to save');
      }
    } catch {
      toast.error(isRTL ? 'خطأ في الاتصال' : 'Connection error');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#0066FF]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#0066FF]">
              <Settings2 className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-[#0B1B33]">
                {isRTL ? 'إعدادات النظام العامة' : 'System Settings'}
              </h1>
              <p className="text-sm font-semibold text-slate-500">
                {isRTL
                  ? 'إدارة سياسات التسجيل وفترات الحجز وقواعد المنصة'
                  : 'Manage registration policies, booking expirations, and platform rules'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Individual Registration Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200/80 bg-[var(--sp-card)] p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-2xl',
                  registrationEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                )}
              >
                <UserCheck className="size-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#0B1B33]">
                    {isRTL ? 'تسجيل الأفراد' : 'Individual Registration'}
                  </h3>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                      registrationEnabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    )}
                  >
                    {registrationEnabled
                      ? isRTL ? 'مفتوح للجميع' : 'Open'
                      : isRTL ? 'مغلق حالياً' : 'Closed'}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {registrationEnabled
                    ? isRTL
                      ? 'يمكن للعملاء الأفراد إنشاء حسابات جديدة والبدء في الحجز فوراً.'
                      : 'Individual users can create accounts and book trips directly.'
                    : isRTL
                      ? 'تم إيقاف التسجيل للأفراد مؤقتاً. لن يتمكن الزوار من إنشاء حسابات أفراد جديدة.'
                      : 'Individual registration is closed. New customers cannot self-register.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <button
                type="button"
                role="switch"
                aria-checked={registrationEnabled}
                onClick={toggleRegistration}
                disabled={saving === 'registration'}
                className={cn(
                  'relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0066FF] focus:ring-offset-2 disabled:opacity-50',
                  registrationEnabled ? 'bg-[#0066FF]' : 'bg-slate-300'
                )}
              >
                <span className="sr-only">Toggle individual registration</span>
                {saving === 'registration' ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="size-3.5 animate-spin text-white" />
                  </span>
                ) : (
                  <span
                    className={cn(
                      'pointer-events-none inline-block size-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
                      isRTL
                        ? registrationEnabled ? '-translate-x-7' : 'translate-x-0'
                        : registrationEnabled ? 'translate-x-7' : 'translate-x-0'
                    )}
                  />
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3.5 text-xs font-medium text-slate-600">
            ℹ️{' '}
            {isRTL
              ? 'ملاحظة: تسجيل الشركات يخضع لعملية مراجعة منفصلة ولا يتأثر بهذا الإعداد.'
              : 'Note: Company registrations go through a separate verification pipeline and are not affected by this switch.'}
          </div>
        </motion.div>

        {/* Company Booking Expiry Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-slate-200/80 bg-[var(--sp-card)] p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-start gap-4 mb-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Clock className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#0B1B33]">
                {isRTL ? 'صلاحية حجز مقاعد الشركات' : 'Company Booking Hold Expiry'}
              </h3>
              <p className="text-sm text-slate-500">
                {isRTL
                  ? 'المدة الزمنية المسموح بها للشركات لتأكيد الحجز قبل إلغائه تلقائياً وإعادة إتاحة المقاعد.'
                  : 'Time limit allowed for partner companies to confirm bookings before auto-cancellation.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={168}
                value={expiryHours}
                onChange={(e) => {
                  setExpiryHours(e.target.value);
                  setSavedExpiry(false);
                }}
                className="w-24 rounded-xl border border-slate-300 bg-[var(--sp-card)] px-3 py-2 text-center text-lg font-black text-[#0B1B33] focus:border-[#0066FF] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20"
              />
              <span className="text-sm font-bold text-slate-600">
                {isRTL ? 'ساعة' : 'hours'}
              </span>
            </div>

            <V2Button
              onClick={saveExpiry}
              disabled={saving === 'expiry'}
              variant="primary"
              size="md"
              className="gap-2"
            >
              {saving === 'expiry' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : savedExpiry ? (
                <Check className="size-4 text-emerald-400" />
              ) : null}
              {savedExpiry
                ? isRTL ? 'تم الحفظ' : 'Saved'
                : isRTL ? 'حفظ التعديل' : 'Save'}
            </V2Button>

            <span className="text-xs text-slate-400">
              {isRTL ? '(الحد الأدنى 1 ساعة، الحد الأقصى 168 ساعة = 7 أيام)' : '(Min 1 hour, max 168 hours = 7 days)'}
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
