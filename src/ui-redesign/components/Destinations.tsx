'use client';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';
import { mockDestinations } from '../data/mockDestinations';

export function Destinations({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  return (
    <section id="destinations" className="bg-white py-16 md:py-20">
      <div className="sp-container">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[34px]">{t.popularTitle}</h2>
            <p className="mt-2 text-pretty text-[15px] text-[#5B6B84] md:text-[16px]">{t.popularSub}</p>
          </div>
          <a href="#featured" className="hidden shrink-0 items-center gap-1.5 text-[14.5px] font-bold text-[#1D5BD8] md:flex">
            {t.exploreAll} <ArrowRight className="size-4 sp-flip-rtl" />
          </a>
        </div>
        <div className="sp-snap-row mt-8">
          {mockDestinations.map((d, i) => (
            <motion.a
              key={d.id}
              href="#featured"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.06 }}
              className="sp-img-zoom sp-hover-lift group relative block overflow-hidden rounded-2xl"
            >
              <div className="aspect-[4/3] w-full bg-[#E6EBF2] lg:aspect-[3/3.4]">
                <img src={d.image} alt="" loading="lazy" className="size-full object-cover" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1B33]/90 via-[#0B1B33]/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                <div>
                  <p className="text-balance text-[17px] font-bold leading-snug text-white">
                    {lang === 'ar' ? `${d.fromAr} ← ${d.toAr}` : `${d.fromEn} → ${d.toEn}`}
                  </p>
                  <p className="mt-1.5 text-[14px] font-medium tabular-nums text-white/85">
                    {t.fromPrice} EGP {d.price}
                  </p>
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#0B1B33]" aria-hidden="true">
                  <ArrowRight className="size-5 sp-flip-rtl" />
                </span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
