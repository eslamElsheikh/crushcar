'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Loader2, Check, Settings2, Building2, UserCheck, CreditCard, Plus, Trash2, Power } from 'lucide-react';
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
  const [vodafone, setVodafone] = useState('');
  const [instapay, setInstapay] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedExpiry, setSavedExpiry] = useState(false);
  const [savedWallets, setSavedWallets] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [loadingPm, setLoadingPm] = useState(false);
  const [newPm, setNewPm] = useState({
    type: 'BANK',
    displayName: '',
    accountHolder: '',
    accountNumber: '',
    instructions: '',
    isActive: true,
    sortOrder: 0,
  });
  const [addingPm, setAddingPm] = useState(false);
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
        if (data['payments.vodafone_number']) {
          setVodafone(data['payments.vodafone_number']);
        }
        if (data['payments.instapay_handle']) {
          setInstapay(data['payments.instapay_handle']);
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
  async function loadPaymentMethods() {
    setLoadingPm(true);
    try {
      const res = await fetch('/api/admin/payment-methods');
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.methods || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingPm(false);
    }
  }

  useEffect(() => {
    loadPaymentMethods();
  }, []);

  async function addPaymentMethod(e: React.FormEvent) {
    e.preventDefault();
    if (!newPm.displayName.trim()) {
      toast.error(isRTL ? 'اسم طريقة الدفع مطلوب' : 'Display name is required');
      return;
    }
    setAddingPm(true);
    try {
      const res = await fetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPm),
      });
      if (res.ok) {
        toast.success(isRTL ? 'تمت إضافة طريقة الدفع بنجاح' : 'Payment method added');
        setNewPm({
          type: 'BANK',
          displayName: '',
          accountHolder: '',
          accountNumber: '',
          instructions: '',
          isActive: true,
          sortOrder: 0,
        });
        loadPaymentMethods();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || err.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setAddingPm(false);
    }
  }

  async function togglePmActive(id: string, current: boolean) {
    try {
      const res = await fetch(`/api/admin/payment-methods/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current }),
      });
      if (res.ok) {
        setPaymentMethods((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isActive: !current } : m))
        );
        toast.success(isRTL ? 'تم تحديث الحالة' : 'Status updated');
      }
    } catch {
      toast.error(t('common.error'));
    }
  }

  async function deletePm(id: string) {
    try {
      const res = await fetch(`/api/admin/payment-methods/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPaymentMethods((prev) => prev.filter((m) => m.id !== id));
        toast.success(isRTL ? 'تم الحذف' : 'Deleted');
      }
    } catch {
      toast.error(t('common.error'));
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

  async function saveWallets() {
    setSaving('wallets');
    setSavedWallets(false);
    try {
      const entries = [
        { key: 'payments.vodafone_number', value: vodafone.trim() },
        { key: 'payments.instapay_handle', value: instapay.trim() },
      ];
      for (const e of entries) {
        const res = await fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(e),
        });
        if (!res.ok) throw new Error('save failed');
      }
      setSavedWallets(true);
      toast.success(isRTL ? 'تم حفظ أرقام المحافظ' : 'Wallet numbers saved');
      setTimeout(() => setSavedWallets(false), 3000);
    } catch {
      toast.error(isRTL ? 'فشل حفظ التعديل' : 'Failed to save');
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

        {/* Payment Wallets Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-slate-200/80 bg-[var(--sp-card)] p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-start gap-4 mb-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Building2 className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#0B1B33]">
                {isRTL ? 'أرقام محافظ الدفع' : 'Payment Wallet Numbers'}
              </h3>
              <p className="text-sm text-slate-500">
                {isRTL
                  ? 'تظهر هذه الأرقام للعملاء ومديري الشركات في صفحات الدفع والشحن.'
                  : 'These numbers are shown to customers and company managers on payment pages.'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('pay.methodVodafone')}</label>
              <input
                value={vodafone}
                onChange={(e) => { setVodafone(e.target.value); setSavedWallets(false); }}
                dir="ltr"
                placeholder="01xxxxxxxxx"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-[var(--sp-card)] px-3.5 py-2.5 text-[15px] font-bold tabular-nums text-[#0B1B33] focus:border-[#0066FF] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20"
              />
            </div>
            <div>
              <label className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('pay.methodInstapay')}</label>
              <input
                value={instapay}
                onChange={(e) => { setInstapay(e.target.value); setSavedWallets(false); }}
                dir="ltr"
                placeholder="name@instapay"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-[var(--sp-card)] px-3.5 py-2.5 text-[15px] font-bold tabular-nums text-[#0B1B33] focus:border-[#0066FF] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20"
              />
            </div>
          </div>

          <V2Button
            onClick={saveWallets}
            disabled={saving === 'wallets'}
            variant="primary"
            size="md"
            className="mt-4 gap-2"
          >
            {saving === 'wallets' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : savedWallets ? (
              <Check className="size-4 text-emerald-400" />
            ) : null}
            {savedWallets
              ? isRTL ? 'تم الحفظ' : 'Saved'
              : isRTL ? 'حفظ الأرقام' : 'Save numbers'}
          </V2Button>
        </motion.div>

        {/* Payment Methods Management Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-slate-200/80 bg-[var(--sp-card)] p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-start gap-4 mb-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <CreditCard className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#0B1B33]">
                {isRTL ? 'إدارة طرق الدفع' : 'Payment Methods Management'}
              </h3>
              <p className="text-sm text-slate-500">
                {isRTL
                  ? 'قائمة طرق الدفع المتاحة للعملاء والشركات (حسابات بنكية، فودافون كاش، إنستاباي، وغيرها).'
                  : 'Configured payment methods for customers and companies (Bank, Vodafone Cash, InstaPay, etc.).'}
              </p>
            </div>
          </div>

          {/* Existing payment methods list */}
          <div className="space-y-3 mb-6">
            {loadingPm ? (
              <div className="flex justify-center p-4">
                <Loader2 className="size-5 animate-spin text-slate-400" />
              </div>
            ) : paymentMethods.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {isRTL ? 'لا توجد طرق دفع مضافة حالياً.' : 'No payment methods configured.'}
              </p>
            ) : (
              paymentMethods.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex items-center justify-between gap-3 p-4 rounded-xl border transition',
                    m.isActive ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
                  )}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#0B1B33] text-[14.5px]">{m.displayName}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {m.type}
                      </span>
                      {!m.isActive && (
                        <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                          {isRTL ? 'معطل' : 'Inactive'}
                        </span>
                      )}
                    </div>
                    {m.accountNumber && (
                      <p className="text-[13px] text-slate-500 font-mono" dir="ltr">
                        {m.accountNumber} {m.accountHolder ? `(${m.accountHolder})` : ''}
                      </p>
                    )}
                    {m.instructions && (
                      <p className="text-[12px] text-slate-400 line-clamp-1">{m.instructions}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => togglePmActive(m.id, m.isActive)}
                      title={m.isActive ? (isRTL ? 'تعطيل' : 'Deactivate') : (isRTL ? 'تفعيل' : 'Activate')}
                      className={cn(
                        'grid size-9 place-items-center rounded-xl border transition',
                        m.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-100 text-slate-400'
                      )}
                    >
                      <Power className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePm(m.id)}
                      title={isRTL ? 'حذف' : 'Delete'}
                      className="grid size-9 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add new method form */}
          <form onSubmit={addPaymentMethod} className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 space-y-3">
            <h4 className="text-[13.5px] font-bold text-[#0B1B33]">
              {isRTL ? 'إضافة طريقة دفع جديدة' : 'Add New Payment Method'}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[12px] font-bold text-slate-600">{isRTL ? 'النوع' : 'Type'}</label>
                <select
                  value={newPm.type}
                  onChange={(e) => setNewPm({ ...newPm, type: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13.5px] font-bold text-[#0B1B33]"
                >
                  <option value="BANK">{isRTL ? 'حساب بنكي' : 'Bank Account'}</option>
                  <option value="VODAFONE_CASH">{isRTL ? 'فودافون كاش' : 'Vodafone Cash'}</option>
                  <option value="INSTAPAY">{isRTL ? 'إنستاباي' : 'InstaPay'}</option>
                  <option value="OTHER">{isRTL ? 'أخرى' : 'Other'}</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] font-bold text-slate-600">{isRTL ? 'الاسم الظاهر (مثل: بنك مصر)' : 'Display Name'}</label>
                <input
                  value={newPm.displayName}
                  onChange={(e) => setNewPm({ ...newPm, displayName: e.target.value })}
                  placeholder={isRTL ? 'مثال: بنك مصر، فودافون كاش...' : 'e.g. Banque Misr'}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13.5px] font-bold text-[#0B1B33]"
                />
              </div>
              <div>
                <label className="text-[12px] font-bold text-slate-600">{isRTL ? 'رقم الحساب / الهاتف' : 'Account Number / Phone'}</label>
                <input
                  value={newPm.accountNumber}
                  onChange={(e) => setNewPm({ ...newPm, accountNumber: e.target.value })}
                  dir="ltr"
                  placeholder="IBAN / 01xxxxxxxxx"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13.5px] font-bold text-[#0B1B33]"
                />
              </div>
              <div>
                <label className="text-[12px] font-bold text-slate-600">{isRTL ? 'اسم صاحب الحساب' : 'Account Holder'}</label>
                <input
                  value={newPm.accountHolder}
                  onChange={(e) => setNewPm({ ...newPm, accountHolder: e.target.value })}
                  placeholder={isRTL ? 'الاسم الثلاثي أو اسم الشركة' : 'Account holder name'}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13.5px] font-bold text-[#0B1B33]"
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-bold text-slate-600">{isRTL ? 'تعليمات الدفع (تظهر للمسافر)' : 'Payment Instructions'}</label>
              <textarea
                value={newPm.instructions}
                onChange={(e) => setNewPm({ ...newPm, instructions: e.target.value })}
                placeholder={isRTL ? 'تعليمات إضافية للتحويل...' : 'Additional transfer instructions...'}
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] leading-relaxed text-[#0B1B33]"
              />
            </div>
            <V2Button
              type="submit"
              disabled={addingPm}
              variant="primary"
              size="md"
              className="gap-2"
            >
              {addingPm ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {isRTL ? 'إضافة طريقة الدفع' : 'Add Payment Method'}
            </V2Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
