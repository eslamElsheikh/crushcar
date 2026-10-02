'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2SectionHeading } from '@/components/v2/ui';
import { V2Skeleton, V2EmptyState } from '@/components/v2/ui';
import { normAr } from '@/lib/arabic';
import { dedupeDestinations, destinationImage } from '@/lib/destinationImages';

/* Public destinations index — same DB data as the homepage section. */

interface Destination {
  id: string; slug: string; nameAr: string; nameEn: string | null;
  imageUrl: string | null; sortOrder: number;
}
interface Station { id: string; name: string; city: string }

export default function DestinationsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [items, setItems] = useState<Destination[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/destinations').then((r) => r.json()),
      fetch('/api/stations').then((r) => r.json()),
    ]).then(([d, s]) => {
      if (Array.isArray(d.data)) setItems(d.data);
      const list = s.stations || s || [];
      if (Array.isArray(list)) setStations(list);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function linkFor(dest: Destination): string {
    const target = normAr(dest.nameAr);
    const st = stations.find((s) => {
      const city = normAr(s.city || '');
      const name = normAr(s.name || '');
      return (city && (city.includes(target) || target.includes(city))) ||
        (name && (name.includes(target) || target.includes(name)));
    });
    return st ? `/trips?toStationId=${st.id}` : '/trips';
  }

  const nameOf = (d: Destination) => (isRTL ? d.nameAr : d.nameEn || d.nameAr);

  /** Public list without name duplicates (admin still manages all). */
  const visibleItems = dedupeDestinations(items);

  return (
    <div className="v2 min-h-dvh bg-white" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container pb-16 pt-8 md:pt-10">
        <V2SectionHeading title={t('v2.popularTitle')} sub={t('v2.popularSub')} />

        <div className="mt-8">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status">
              {[0, 1, 2, 3].map((i) => (
                <V2Skeleton key={i} className="aspect-[4/3] rounded-2xl lg:aspect-[3/3.4]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <V2EmptyState
              title={isRTL ? 'لا توجد وجهات متاحة حاليًا' : 'No destinations available right now'}
              actionLabel={t('v2.browseTrips')}
              onAction={() => { window.location.href = '/trips'; }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visibleItems.map((dest, i) => (
                <motion.div
                  key={dest.id}
                  initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                  transition={{ duration: 0.2, ease: 'easeOut', delay: Math.min(i, 6) * 0.06 }}
                >
                  <Link href={linkFor(dest)} className="v2-img-zoom v2-hover-lift group relative block overflow-hidden rounded-2xl">
                    <div className="relative aspect-[4/3] w-full bg-[#0A1E3C] lg:aspect-[3/3.4]">
                      <Image src={destinationImage(dest)} alt={nameOf(dest)} fill sizes="(max-width:640px) 100vw, (max-width:1024px) 45vw, 22vw" className="object-cover" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B1B33]/90 via-[#0B1B33]/15 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                      <p className="text-balance text-[17px] font-bold leading-snug text-white">{nameOf(dest)}</p>
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#0B1B33]" aria-hidden="true">
                        <ArrowRight className="size-5 v2-flip-rtl" />
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      <V2SiteFooter />
    </div>
  );
}
