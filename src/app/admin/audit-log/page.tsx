'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, Search, Clock, User, ShieldCheck } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { cn } from '@/lib/utils';
import { V2StatusBadge, V2EmptyState, V2Skeleton } from '@/components/v2/ui';

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string;
  userEmail: string;
  companyId: string | null;
  metadata: any;
  createdAt: string;
}

const toneForAction = (a: string): 'green' | 'amber' | 'red' | 'blue' | 'slate' => {
  switch (a) {
    case 'CREATE':
    case 'APPROVE':
      return 'green';
    case 'PAY':
    case 'REFUND':
      return 'amber';
    case 'CANCEL':
    case 'REJECT':
      return 'red';
    case 'BOARD':
    case 'UPDATE':
      return 'blue';
    default:
      return 'slate';
  }
};

export default function AdminAuditLog() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadLogs();
  }, [actionFilter, entityFilter, offset]);

  async function loadLogs() {
    setLoading(true);
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    if (entityFilter) params.set('entity', entityFilter);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    try {
      const res = await fetch(`/api/admin/audit-log?${params}`, { credentials: 'include' });
      const json = await res.json();
      setLogs(json.data || []);
      setTotal(json.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0B1B33] flex items-center gap-2.5">
            <ScrollText className="text-[#1D5BD8]" size={24} />
            <span>{isRTL ? 'سجل العمليات والرقابة (Audit Log)' : 'Audit & Activity Log'}</span>
          </h1>
          <p className="text-xs text-[var(--sp-text-muted)] mt-1 font-medium">
            {total} {isRTL ? 'سجل مسجل في النظام' : 'total audit entries'}
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-2.5 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setOffset(0);
              }}
              placeholder={isRTL ? 'تصفية بالإجراء...' : 'Filter by action...'}
              className="w-44 px-3.5 py-2 pl-9 rounded-xl bg-[var(--sp-card)] border border-[var(--sp-line)] text-xs font-semibold text-[#0B1B33] placeholder:text-slate-400 focus:outline-none focus:border-[#1D5BD8] shadow-sm"
            />
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setOffset(0);
              }}
              placeholder={isRTL ? 'تصفية بالكيان...' : 'Filter by entity...'}
              className="w-44 px-3.5 py-2 pl-9 rounded-xl bg-[var(--sp-card)] border border-[var(--sp-line)] text-xs font-semibold text-[#0B1B33] placeholder:text-slate-400 focus:outline-none focus:border-[#1D5BD8] shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          <V2Skeleton className="h-16 w-full rounded-2xl" />
          <V2Skeleton className="h-16 w-full rounded-2xl" />
          <V2Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : logs.length === 0 ? (
        <V2EmptyState
          title={isRTL ? 'لا توجد سجلات مطابقة' : 'No audit entries found'}
          desc={isRTL ? 'لم يتم العثور على أي نشاط مطابق لخيارات البحث' : 'No activity records match your criteria'}
        />
      ) : (
        <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] overflow-hidden shadow-sm">
          <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3.5 bg-[var(--sp-inset)] border-b border-slate-200/80 text-xs font-bold text-[var(--sp-text-muted)] uppercase tracking-wider">
            <div className="col-span-2">{isRTL ? 'الإجراء' : 'Action'}</div>
            <div className="col-span-2">{isRTL ? 'الكيان' : 'Entity'}</div>
            <div className="col-span-3">{isRTL ? 'المستخدم' : 'User'}</div>
            <div className="col-span-3">{isRTL ? 'التفاصيل / Metadata' : 'Details'}</div>
            <div className="col-span-2 text-end">{isRTL ? 'الوقت' : 'Timestamp'}</div>
          </div>

          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div
                key={log.id}
                className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 px-6 py-3.5 hover:bg-slate-50/70 transition items-center text-xs"
              >
                <div className="lg:col-span-2">
                  <V2StatusBadge tone={toneForAction(log.action)}>
                    {log.action}
                  </V2StatusBadge>
                </div>

                <div className="lg:col-span-2 font-mono font-bold text-[#0B1B33]">
                  {log.entity} <span className="text-slate-400 text-[10px]">#{log.entityId.slice(0, 8)}</span>
                </div>

                <div className="lg:col-span-3 truncate">
                  <span className="font-semibold text-[#0B1B33] block truncate">
                    {log.userEmail || log.userId || 'System'}
                  </span>
                </div>

                <div className="lg:col-span-3 truncate text-[var(--sp-text-muted)] font-mono text-[11px]">
                  {typeof log.metadata === 'object' ? JSON.stringify(log.metadata) : log.metadata || '—'}
                </div>

                <div className="lg:col-span-2 text-start lg:text-end text-slate-400 font-medium">
                  {new Date(log.createdAt).toLocaleString(locale, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {total > limit && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-[var(--sp-inset)]/50 text-xs">
              <span className="text-[var(--sp-text-muted)] font-medium">
                {offset + 1} - {Math.min(offset + limit, total)} {isRTL ? 'من' : 'of'} {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-3.5 py-1.5 rounded-lg border border-[var(--sp-line)] bg-[var(--sp-card)] font-bold text-[#0B1B33] disabled:opacity-40 hover:bg-slate-50 transition"
                >
                  {isRTL ? 'السابق' : 'Previous'}
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-3.5 py-1.5 rounded-lg border border-[var(--sp-line)] bg-[var(--sp-card)] font-bold text-[#0B1B33] disabled:opacity-40 hover:bg-slate-50 transition"
                >
                  {isRTL ? 'التالي' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
