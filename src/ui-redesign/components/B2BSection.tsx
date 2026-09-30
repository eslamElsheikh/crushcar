'use client';
import { motion } from 'framer-motion';
import { Check, ArrowRight, LayoutDashboard } from 'lucide-react';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';
import { DashboardPreview } from './DashboardPreview';

const EN_BULLETS = [
  'Full bus charter & group bookings',
  'Custom routes and schedules',
  'Dedicated company account',
  'Flexible payment options',
];
const AR_BULLETS = [
  'حجز باص كامل ورحلات جماعية',
  'مسارات ومواعيد مخصصة',
  'حساب مخصص للشركات',
  'خيارات دفع مرنة',
];

export function B2BSection({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  const bullets = lang === 'ar' ? AR_BULLETS : EN_BULLETS;
  return (
    <section id="b2b" className="scroll-mt-20 bg-[#F6F8FC] py-16 md:py-24">
      <div className="sp-container grid items-center gap-12 lg:grid-cols-[400px_1fr_300px]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <p className="text-[12px] font-bold tracking-[0.2em] text-[#1D5BD8]">{t.b2bEyebrow}</p>
          <h2 className="mt-3 text-balance text-[28px] font-extrabold leading-tight text-[#0B1B33] md:text-[36px]">{t.b2bTitle}</h2>
          <p className="mt-4 text-pretty text-[15.5px] leading-relaxed text-[#5B6B84] md:text-[16.5px]">{t.b2bSub}</p>
          <ul className="mt-6 grid gap-3.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[15px] font-semibold text-[#0B1B33]">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#0A1E3C] text-white">
                  <Check className="size-3.5" />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <a href="#b2b" className="sp-btn-dark mt-7 inline-flex items-center gap-2 px-6 py-4 text-[15px]">
            {t.b2bCta} <ArrowRight className="size-4 sp-flip-rtl" />
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, ease: 'easeOut', delay: 0.1 }}
        >
          <DashboardPreview lang={lang} />
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, ease: 'easeOut', delay: 0.15 }}
          className="rounded-2xl border border-[#E6EBF2] bg-white p-7 shadow-[0_12px_32px_rgba(11,27,51,0.08)]"
        >
          <span className="grid size-12 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
            <LayoutDashboard className="size-6" />
          </span>
          <p className="mt-5 text-balance text-[17px] font-extrabold leading-snug text-[#0B1B33]">{t.b2bSideTitle}</p>
          <p className="mt-2.5 text-pretty text-[14px] leading-relaxed text-[#5B6B84]">{t.b2bSideSub}</p>
          <a href="#b2b" className="sp-btn-dark mt-6 flex items-center justify-center gap-2 px-4 py-3.5 text-[14.5px]">
            {t.b2bSideCta} <ArrowRight className="size-4 sp-flip-rtl" />
          </a>
        </motion.aside>
      </div>
    </section>
  );
}
