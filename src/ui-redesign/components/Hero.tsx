'use client';
import { motion } from 'framer-motion';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';
import { BookingWidget } from './BookingWidget';

export function Hero({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=2000&q=75"
          alt=""
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B1B33]/70 via-[#0B1B33]/35 to-[#0B1B33]/55" />
      </div>
      <div className="sp-container relative pb-12 pt-28 md:pb-16 md:pt-32">
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="text-[12px] font-bold tracking-[0.22em] text-white/75"
        >
          {t.heroEyebrow}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, ease: 'easeOut', delay: 0.05 }}
          className="mt-4 max-w-[600px] text-balance text-[40px] font-extrabold leading-[1.08] text-white md:text-[64px] md:leading-[1.04]"
        >
          {t.heroTitleA}
          <br />
          <span className="bg-gradient-to-r from-[#9DBCFF] to-[#5EE6FF] bg-clip-text text-transparent">{t.heroTitleB}</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, ease: 'easeOut', delay: 0.1 }}
          className="mt-5 max-w-[480px] text-pretty text-[16px] leading-relaxed text-white/90 md:text-[19px]"
        >
          {t.heroSubtitle}
        </motion.p>
        <motion.div
          id="booking"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, ease: 'easeOut', delay: 0.15 }}
          className="mt-8 scroll-mt-24"
        >
          <BookingWidget lang={lang} />
        </motion.div>
      </div>
    </section>
  );
}
