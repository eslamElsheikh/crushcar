'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Safro brand logo (legacy lockup). Image-only — the file already contains the wordmark. */
export function V2Logo({ height = 38, className }: { height?: number; className?: string }) {
  return (
    <Image
      src="/safro_logo.png"
      alt="Safro"
      width={1535}
      height={1025}
      style={{ height, width: 'auto' }}
      className={cn('shrink-0', className)}
    />
  );
}
