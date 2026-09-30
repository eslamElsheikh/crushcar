'use client';
import { Zap, MapPin, ShieldCheck, Leaf } from 'lucide-react';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';

export function TrustStrip({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  const items = [
    { icon: Zap, title: t.trustRoutes, sub: t.trustRoutesSub },
    { icon: MapPin, title: t.trustStations, sub: t.trustStationsSub },
    { icon: ShieldCheck, title: t.trustSecure, sub: t.trustSecureSub },
    { icon: Leaf, title: t.trustGreen, sub: t.trustGreenSub },
  ];
  return (
    <section className="border-b border-[#E6EBF2] bg-white">
      <div className="sp-container grid grid-cols-2 gap-x-4 gap-y-7 py-8 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.title} className="flex items-center gap-3.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#F1F4F9] text-[#0A1E3C]">
              <it.icon className="size-6" />
            </span>
            <span>
              <span className="block text-balance text-[15.5px] font-extrabold tabular-nums text-[#0B1B33]">{it.title}</span>
              <span className="mt-0.5 block text-[13px] text-[#5B6B84]">{it.sub}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
