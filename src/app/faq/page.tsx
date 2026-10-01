'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Skeleton, V2EmptyState } from '@/components/v2/ui';

/* V2 FAQ — same /api/faqs data as V1. */

interface Faq { id: string; questionAr: string; questionEn: string; answerAr: string; answerEn: string }

export default function FaqPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/faqs');
        if (res.ok) {
          const data = await res.json();
          setFaqs(Array.isArray(data) ? data : data.data || []);
        }
      } catch { /* keep empty */ } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container max-w-3xl pb-16 pt-8 md:pt-10">
        <h1 className="text-balance text-[28px] font-extrabold text-[#0B1B33] md:text-[36px]">
          {t('faq.title')}
        </h1>
        <p className="mt-2 text-pretty text-[15px] text-[#5B6B84]">{t('faq.subtitle')}</p>

        <div className="mt-7">
          {loading ? (
            <div className="grid gap-3" role="status">
              <V2Skeleton className="h-20 rounded-2xl" />
              <V2Skeleton className="h-20 rounded-2xl" />
              <V2Skeleton className="h-20 rounded-2xl" />
            </div>
          ) : faqs.length === 0 ? (
            <V2EmptyState
              title={t('faq.noFaqs')}
              actionLabel={t('v2.browseTrips')}
              onAction={() => { window.location.href = '/trips'; }}
            />
          ) : (
            <div className="grid gap-3">
              {faqs.map((f) => {
                const open = openId === f.id;
                return (
                  <div key={f.id} className="v2-card overflow-hidden">
                    <button
                      onClick={() => setOpenId(open ? null : f.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 p-5 text-start"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
                        <MessageCircleQuestion className="size-5" />
                      </span>
                      <span className="flex-1 text-[15.5px] font-extrabold text-[#0B1B33]">
                        {isRTL ? f.questionAr : f.questionEn}
                      </span>
                      <ChevronDown className={cn('size-5 shrink-0 text-[#5B6B84] transition-transform', open && 'rotate-180')} />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
                          className="overflow-hidden"
                        >
                          <p className="px-5 pb-5 ps-[76px] text-pretty text-[14.5px] leading-relaxed text-[#5B6B84]">
                            {isRTL ? f.answerAr : f.answerEn}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <V2SiteFooter />
    </div>
  );
}
