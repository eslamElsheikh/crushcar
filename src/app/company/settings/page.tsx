'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Settings, Image as ImageIcon, Upload, Loader2, Check, AlertCircle, Building2, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { cn } from '@/lib/utils';
import { V2Button } from '@/components/v2/Button';

export default function CompanySettingsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showLogoOnTicket, setShowLogoOnTicket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/company/info')
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setCompanyName(data.name || '');
          setLogoUrl(data.logoUrl || null);
          setShowLogoOnTicket(!!data.showLogoOnTicket);
        }
      })
      .catch(() => {
        toast.error(isRTL ? 'تعذر تحميل بيانات الشركة' : 'Failed to load company details');
      })
      .finally(() => setLoading(false));
  }, [isRTL]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(isRTL ? 'نوع الملف غير مدعوم. الأنواع المسموحة: PNG, JPG, WebP' : 'Invalid file type. Allowed: PNG, JPG, WebP');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error(isRTL ? 'حجم الملف كبير جداً. الحد الأقصى 2 ميجابايت' : 'File too large. Maximum 2MB');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    const formData = new FormData();
    formData.append('logo', file);

    setUploading(true);
    try {
      const res = await fetch('/api/company/settings/logo', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setLogoUrl(data.logoUrl);
        setPreview(null);
        toast.success(isRTL ? 'تم رفع شعار الشركة بنجاح' : 'Company logo uploaded successfully');
      } else {
        toast.error(data.error || (isRTL ? 'فشل رفع الشعار' : 'Upload failed'));
        setPreview(null);
      }
    } catch {
      toast.error(isRTL ? 'خطأ في رفع الملف' : 'Upload error');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  async function toggleShowLogo() {
    const newVal = !showLogoOnTicket;
    setSaving(true);
    try {
      const res = await fetch('/api/company/settings/logo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showLogoOnTicket: newVal }),
      });
      if (res.ok) {
        setShowLogoOnTicket(newVal);
        toast.success(
          newVal
            ? isRTL ? 'سيظهر شعار شركتك على تذاكر الركاب' : 'Logo will appear on tickets'
            : isRTL ? 'تم إلغاء ظهور الشعار على التذاكر' : 'Logo hidden from tickets'
        );
      } else {
        const data = await res.json();
        toast.error(data.error || (isRTL ? 'فشل حفظ الإعداد' : 'Failed to save setting'));
      }
    } catch {
      toast.error(isRTL ? 'خطأ في الاتصال' : 'Connection error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#0066FF]" />
      </div>
    );
  }

  const currentDisplayLogo = preview || logoUrl;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#0066FF]">
            <Settings className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#0B1B33]">
              {isRTL ? 'إعدادات الشركة' : 'Company Settings'}
            </h1>
            <p className="text-sm font-semibold text-slate-500">
              {companyName ? `${companyName} • ` : ''}
              {isRTL ? 'تخصيص الهوية والشعار وإعدادات طباعة التذاكر' : 'Customize identity, logo and ticket print layout'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Logo Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-[#0066FF]">
              <ImageIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0B1B33]">
                {isRTL ? 'شعار الشركة الرسمي' : 'Company Official Logo'}
              </h2>
              <p className="text-xs text-slate-500">
                {isRTL ? 'يُستخدم الشعار في الهيدر والتقارير وتذاكر الحجز للركاب' : 'Used across portal header, reports, and passenger tickets'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-2">
            <div className="relative group shrink-0">
              <div className="size-28 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden p-2 transition group-hover:border-[#0066FF]/40">
                {currentDisplayLogo ? (
                  <img
                    src={currentDisplayLogo}
                    alt="Company Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Building2 className="size-10 text-slate-300" />
                )}
              </div>
            </div>

            <div className="flex-1 space-y-3 text-center sm:text-start">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <V2Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  variant="primary"
                  size="md"
                  className="gap-2"
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {uploading
                    ? isRTL ? 'جاري الرفع...' : 'Uploading...'
                    : isRTL ? 'اختيار شعار جديد' : 'Upload New Logo'}
                </V2Button>

                {logoUrl && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-1.5">
                    <Check className="size-3.5" />
                    {isRTL ? 'الشعار مفعل' : 'Logo Active'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {isRTL
                  ? 'الصيغ المدعومة: PNG أو JPG أو WebP • الحد الأقصى للملف 2 ميجابايت'
                  : 'Supported formats: PNG, JPG, or WebP • Max size 2MB'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Ticket Display Preference Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Ticket className="size-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#0B1B33]">
                  {isRTL ? 'عرض الشعار على التذكرة المطبوعة' : 'Show Logo on Printed Ticket'}
                </h3>
                <p className="text-sm text-slate-500">
                  {isRTL
                    ? 'عند التفعيل، سيظهر شعار شركتك بجانب اسم المسافر وتفاصيل المقعد في التذكرة بصيغة PDF والطباعة.'
                    : 'When enabled, your company logo appears at the top of passenger tickets and printable PDFs.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <button
                type="button"
                role="switch"
                aria-checked={showLogoOnTicket}
                onClick={toggleShowLogo}
                disabled={saving || !logoUrl}
                title={!logoUrl ? (isRTL ? 'يرجى رفع شعار أولاً' : 'Please upload a logo first') : ''}
                className={cn(
                  'relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0066FF] focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed',
                  showLogoOnTicket ? 'bg-[#0066FF]' : 'bg-slate-300'
                )}
              >
                <span className="sr-only">Toggle logo on ticket</span>
                {saving ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="size-3.5 animate-spin text-white" />
                  </span>
                ) : (
                  <span
                    className={cn(
                      'pointer-events-none inline-block size-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
                      isRTL
                        ? showLogoOnTicket ? '-translate-x-7' : 'translate-x-0'
                        : showLogoOnTicket ? 'translate-x-7' : 'translate-x-0'
                    )}
                  />
                )}
              </button>
            </div>
          </div>

          {!logoUrl && (
            <div className="mt-4 rounded-xl bg-amber-50 p-3.5 text-xs font-medium text-amber-800 border border-amber-200/60">
              ⚠️ {isRTL ? 'يجب رفع شعار الشركة أولاً لتفعيل هذا الخيار على التذاكر.' : 'Please upload a logo first to enable ticket branding.'}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
