'use client';

import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { V2Input } from './Field';
import { V2Skeleton } from './ui';

/* Shared V2 admin primitives — one visual language for all ops pages. */

export function V2PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-balance text-[24px] font-extrabold text-[#0B1B33] md:text-[30px]">{title}</h1>
        {sub && <p className="mt-1 text-[14px] tabular-nums text-[#5B6B84]">{sub}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2.5">{action}</div>}
    </div>
  );
}

export function V2StatCard({
  label,
  value,
  sub,
  icon,
  index = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut', delay: index * 0.05 }}
      className="rounded-2xl border border-[#E6EBF2] bg-white p-5 shadow-[0_12px_32px_rgba(11,27,51,0.08)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-semibold text-[#5B6B84]">{label}</p>
        {icon}
      </div>
      <p className="mt-2 truncate text-[24px] font-extrabold tabular-nums text-[#0B1B33]">{value}</p>
      {sub && <p className="mt-1 truncate text-[12.5px] text-[#5B6B84]">{sub}</p>}
    </motion.div>
  );
}

export function V2SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <span className={cn('relative block', className)}>
      <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
      <V2Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="ps-11"
      />
    </span>
  );
}

/** Responsive table: real table on desktop, stacked cards on mobile. */
export function V2Table<T>({
  columns,
  rows,
  rowKey,
  renderCell,
  renderMobile,
  loading,
  emptyTitle,
}: {
  columns: string[];
  rows: T[];
  rowKey: (row: T) => string;
  renderCell: (row: T, colIndex: number) => ReactNode;
  renderMobile: (row: T) => ReactNode;
  loading?: boolean;
  emptyTitle: string;
}) {
  if (loading) {
    return (
      <div className="grid gap-3" role="status">
        <V2Skeleton className="h-14 rounded-2xl" />
        <V2Skeleton className="h-14 rounded-2xl" />
        <V2Skeleton className="h-14 rounded-2xl" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-10 text-center text-[14.5px] font-semibold text-[#5B6B84]">
        {emptyTitle}
      </div>
    );
  }
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[#E6EBF2] bg-white md:block">
        <table className="w-full min-w-[720px] border-collapse text-start">
          <thead>
            <tr className="border-b border-slate-100 bg-[#F6F8FC]">
              {columns.map((c) => (
                <th key={c} className="px-5 py-3.5 text-[12.5px] font-bold uppercase text-[#5B6B84]">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-slate-50 transition last:border-0 hover:bg-[#F6F8FC]">
                {columns.map((_, i) => (
                  <td key={i} className="px-5 py-4 text-[14px] text-[#0B1B33]">
                    {renderCell(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <div key={rowKey(row)} className="rounded-2xl border border-[#E6EBF2] bg-white p-4">
            {renderMobile(row)}
          </div>
        ))}
      </div>
    </>
  );
}

export function V2Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-center gap-2">
      <button
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
        className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-[#0B1B33] disabled:opacity-40"
      >
        <ChevronLeft className="size-5 v2-flip-rtl" />
      </button>
      <span className="text-[14px] font-bold tabular-nums text-[#0B1B33]">{page} / {pages}</span>
      <button
        onClick={() => onPage(Math.min(pages, page + 1))}
        disabled={page >= pages}
        aria-label="Next page"
        className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-[#0B1B33] disabled:opacity-40"
      >
        <ChevronRight className="size-5 v2-flip-rtl" />
      </button>
    </div>
  );
}

export function V2Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <div className="absolute inset-0 bg-[#0B1B33]/60" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'relative max-h-[90dvh] w-full overflow-y-auto rounded-2xl bg-white p-6',
              wide ? 'max-w-[720px]' : 'max-w-[520px]'
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[18px] font-extrabold text-[#0B1B33]">{title}</p>
              <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function V2Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-[#E6EBF2]" role="tablist">
      {tabs.map((tb) => (
        <button
          key={tb.key}
          role="tab"
          aria-selected={active === tb.key}
          onClick={() => onChange(tb.key)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-[14px] font-bold tabular-nums transition',
            active === tb.key ? 'bg-[#0A1E3C] text-white shadow' : 'text-[#5B6B84] hover:bg-slate-50'
          )}
        >
          {tb.label}
          {tb.count !== undefined && ` · ${tb.count}`}
        </button>
      ))}
    </div>
  );
}
