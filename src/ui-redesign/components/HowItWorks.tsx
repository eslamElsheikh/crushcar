'use client';
import { motion } from 'framer-motion';
import { Search, Bus, Armchair, TicketCheck, ArrowRight } from 'lucide-react';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';

export function HowItWorks({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  const steps = [
    { icon: Search, title: t.how1t, desc: t.how1d },
    { icon: Bus, title: t.how2t, desc: t.how2d },
    { icon: Armchair, title: t.how3t, desc: t.how3d },
    { icon: TicketCheck, title: t.how4t, desc: t.how4d },
  ];
  return (
    <section className="bg-[#F6F8FC] py-16 md:py-20">
      <div className="sp-container grid gap-12 lg:grid-cols-[340px_1fr] lg:items-center">
        <div>
          <p className="text-[12px] font-bold tracking-[0.2em] text-[#1D5BD8]">{t.howEyebrow}</p>
          <h2 className="mt-3 text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[34px]">{t.howTitle}</h2>
          <p className="mt-3 text-pretty text-[15px] leading-relaxed text-[#5B6B84] md:text-[16px]">{t.howSub}</p>
          <a href="#booking" className="sp-btn-primary mt-6 inline-flex items-center gap-2 px-6 py-3.5 text-[15px]">
            {t.howCta} <ArrowRight className="size-4 sp-flip-rtl" />
          </a>
        </div>
        {/* DOM order stays Search→Compare→Choose→Travel; visual order flips naturally in RTL */}
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {steps.map((s, i) => (
            <motion.li
              key={s.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.07 }}
              className="relative text-center"
            >
              <span className="absolute -top-1.5 start-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-[#1D5BD8] text-[12px] font-bold tabular-nums text-white rtl:translate-x-1/2">
                {i + 1}
              </span>
              <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white text-[#1D5BD8] shadow-[0_12px_32px_rgba(11,27,51,0.08)]">
                <s.icon className="size-7" />
              </span>
              <p className="mt-4 text-balance text-[15.5px] font-extrabold text-[#0B1B33]">{s.title}</p>
              <p className="mx-auto mt-2 max-w-[220px] text-pretty text-[13.5px] leading-relaxed text-[#5B6B84]">{s.desc}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
