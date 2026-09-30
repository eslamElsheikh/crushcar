'use client';
import { motion } from 'framer-motion';
import { Clock, Star, ArrowRight } from 'lucide-react';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';
import { mockTrips } from '../data/mockTrips';

export function FeaturedTrips({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  return (
    <section id="featured" className="scroll-mt-20 bg-white py-16 md:py-20">
      <div className="sp-container">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[34px]">{t.featTitle}</h2>
            <p className="mt-2 text-pretty text-[15px] text-[#5B6B84] md:text-[16px]">{t.featSub}</p>
          </div>
          <a href="#featured" className="hidden shrink-0 items-center gap-1.5 text-[14.5px] font-bold text-[#1D5BD8] md:flex">
            {t.viewAll} <ArrowRight className="size-4 sp-flip-rtl" />
          </a>
        </div>
        <div className="sp-snap-row mt-8">
          {mockTrips.map((trip, i) => (
            <motion.article
              key={trip.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.06 }}
              className="sp-hover-lift flex flex-col overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white"
            >
              <div className="relative h-40 overflow-hidden bg-[#E6EBF2]">
                <img src={trip.image} alt="" loading="lazy" className="size-full object-cover" />
                <span className="absolute end-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-bold text-[#1D5BD8]">
                  {t.direct}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-balance text-[17px] font-extrabold leading-snug text-[#0B1B33]">
                  {lang === 'ar' ? `${trip.fromAr} ← ${trip.toAr}` : `${trip.fromEn} → ${trip.toEn}`}
                </p>
                <p className="mt-2 text-[14.5px] font-bold tabular-nums text-[#0B1B33]" dir="ltr" style={{ textAlign: 'start' }}>
                  {trip.depart} → {trip.arrive}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[#5B6B84]">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-4" /> {lang === 'ar' ? trip.durationAr : trip.durationEn}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{trip.stops} stops</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-bold text-[#0B1B33]">
                    <Star className="size-4 fill-amber-400 text-amber-400" /> {trip.rating}
                  </span>
                </p>
                <p className="mt-4 text-[22px] font-extrabold tabular-nums text-[#0B1B33]">
                  EGP {trip.price}
                  <span className="ms-1.5 text-[13px] font-medium text-[#5B6B84]">{t.perPassenger}</span>
                </p>
                <button className="mt-4 w-full rounded-xl bg-[#EFF4FF] py-3.5 text-[14.5px] font-bold text-[#1D5BD8] transition hover:bg-[#1D5BD8] hover:text-white">
                  {t.selectTrip} →
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
