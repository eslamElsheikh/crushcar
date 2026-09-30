'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Trash2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2Skeleton } from '@/components/v2/ui';

/* V2 bus layout + stations editor — same load/save APIs as V1. */

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const MAX_ROWS = 12;

type SeatType = 'NORMAL' | 'VIP' | 'DISABLED';
interface SeatDraft { label: string; row: number; col: number; type: SeatType; price: number }

const TYPE_PRICE: Record<SeatType, number> = { NORMAL: 0, VIP: 50, DISABLED: 0 };

export default function BusLayoutPage() {
  const params = useParams();
  const router = useRouter();
  const busId = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [busName, setBusName] = useState('');
  const [seats, setSeats] = useState<SeatDraft[]>([]);
  const [totalRows, setTotalRows] = useState(10);
  const [colsPerRow, setColsPerRow] = useState<Record<string, number>>({});
  const [aisleAfter, setAisleAfter] = useState(2);
  const [selected, setSelected] = useState<string | null>(null);
  const [stations, setStations] = useState<{ id?: string; name: string; order: number }[]>([]);
  const [newStation, setNewStation] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStations, setSavingStations] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [busRes, stRes] = await Promise.all([
          fetch(`/api/buses/${busId}`, { credentials: 'include' }),
          fetch(`/api/buses/${busId}/stations`, { credentials: 'include' }),
        ]);
        if (busRes.ok) {
          const data = await busRes.json();
          setBusName(data.name || '');
          if (data.layout?.seats?.length) {
            setTotalRows(data.layout.rows);
            setAisleAfter(data.layout.aisleAfter || 2);
            let parsed: Record<string, number> = {};
            if (data.layout.colsPerRow) {
              try {
                parsed = JSON.parse(data.layout.colsPerRow);
              } catch { /* fall through */ }
            }
            if (Object.keys(parsed).length === 0) {
              const maxCol = Math.max(...data.layout.seats.map((s: any) => s.col));
              ROWS.forEach((r, i) => { if (i < data.layout.rows) parsed[r] = maxCol; });
            }
            setColsPerRow(parsed);
            setSeats(data.layout.seats.map((s: any) => ({ label: s.label, row: s.row, col: s.col, type: s.type, price: s.price || 0 })));
          } else {
            const def: Record<string, number> = {};
            ROWS.forEach((r, i) => { if (i < 10) def[r] = 4; });
            setColsPerRow(def);
          }
        }
        if (stRes.ok) {
          const data = await stRes.json();
          const list = Array.isArray(data) ? data : data.stations || [];
          setStations(list.map((s: any) => ({ id: s.id, name: s.name, order: s.order })));
        }
      } catch { /* keep blank */ } finally { setLoading(false); }
    })();
  }, [busId]);

  function colsFor(rowLetter: string): number {
    return colsPerRow[rowLetter] || 4;
  }

  function addSeat(row: number, col: number) {
    const base = `${ROWS[row]}${col}`;
    let label = base;
    let n = 2;
    while (seats.some((s) => s.label === label)) label = `${base}-${n++}`;
    setSeats([...seats, { label, row, col, type: 'NORMAL', price: 0 }]);
    setSelected(label);
  }

  function removeSeat(label: string) {
    setSeats(seats.filter((s) => s.label !== label));
    setSelected(null);
  }

  function updateSeat(label: string, updates: Partial<SeatDraft>) {
    setSeats(seats.map((s) => (s.label === label ? { ...s, ...updates } : s)));
  }

  // Drop seats that fall outside the current grid
  function cleanOrphans(next: SeatDraft[], rows: number, cols: Record<string, number>): SeatDraft[] {
    return next.filter((s) => s.row < rows && s.col <= (cols[ROWS[s.row]] || 4));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/buses/${busId}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rows: totalRows,
          cols: 6,
          aisleAfter,
          colsPerRow: JSON.stringify(colsPerRow),
          seats,
        }),
      });
      if (res.ok) router.push('/admin/buses');
      else toast.error(t('common.error'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function saveStations() {
    setSavingStations(true);
    try {
      const res = await fetch(`/api/buses/${busId}/stations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stations: stations.map((s, i) => ({ name: s.name, order: i + 1 })) }),
      });
      if (res.ok) toast.success(t('common.success'));
      else toast.error(t('common.error'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSavingStations(false);
    }
  }

  const sel = seats.find((s) => s.label === selected);

  return (
    <div>
      <Link href="/admin/buses" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#5B6B84] hover:text-[#0B1B33]">
        <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('nav.buses')}
      </Link>
      <div className="mt-3">
        <V2PageHeader
          title={busName || (isRTL ? 'تخطيط الباص' : 'Bus layout')}
          action={
            <V2Button disabled={saving} onClick={save}>
              {saving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />} {t('common.save')}
            </V2Button>
          }
        />
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3" role="status">
          <V2Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <V2Field label={isRTL ? 'الصفوف' : 'Rows'}>
                <V2Input
                  type="number" min="1" max={MAX_ROWS} value={totalRows}
                  onChange={(e) => {
                    const r = Math.max(1, Math.min(MAX_ROWS, Number(e.target.value) || 1));
                    setTotalRows(r);
                    setSeats((prev) => cleanOrphans(prev, r, colsPerRow));
                  }}
                  dir="ltr" className="tabular-nums !min-h-[48px] !w-24"
                />
              </V2Field>
              <V2Field label={isRTL ? 'الممر بعد' : 'Aisle after'}>
                <V2Input
                  type="number" min="0" max="6" value={aisleAfter}
                  onChange={(e) => setAisleAfter(Number(e.target.value) || 0)}
                  dir="ltr" className="tabular-nums !min-h-[48px] !w-24"
                />
              </V2Field>
              <p className="ms-auto text-[13px] tabular-nums text-[#5B6B84]">
                {seats.length} {isRTL ? 'مقعد' : 'seats'}
              </p>
            </div>

            <div className="mt-5 grid gap-1.5 overflow-x-auto pb-2">
              {Array.from({ length: totalRows }, (_, rowIdx) => {
                const letter = ROWS[rowIdx];
                const count = colsFor(letter);
                return (
                  <div key={rowIdx} className="flex items-center gap-1.5">
                    <span className="w-6 shrink-0 text-center text-[11px] font-bold tabular-nums text-[#9AA8BD]">{letter}</span>
                    <input
                      type="number" min="1" max="6" value={count}
                      onChange={(e) => {
                        const c = Math.max(1, Math.min(6, Number(e.target.value) || 1));
                        const next = { ...colsPerRow, [letter]: c };
                        setColsPerRow(next);
                        setSeats((prev) => cleanOrphans(prev, totalRows, next));
                      }}
                      aria-label={`Columns row ${letter}`}
                      dir="ltr"
                      className="w-11 shrink-0 rounded-lg border border-slate-200 py-1 text-center text-[12px] tabular-nums"
                    />
                    {Array.from({ length: count }, (_, colIdx) => {
                      const col = colIdx + 1;
                      const seat = seats.find((s) => s.row === rowIdx && s.col === col);
                      const isAisle = col === aisleAfter + 1 && count > 3;
                      if (!seat) {
                        return (
                          <button
                            key={colIdx} onClick={() => addSeat(rowIdx, col)}
                            aria-label={`Add seat ${letter}${col}`}
                            className={cn('grid size-10 shrink-0 place-items-center rounded-lg border border-dashed border-slate-300 text-slate-300 hover:border-[#1D5BD8]/60 hover:text-[#1D5BD8]', isAisle && 'ms-5')}
                          >
                            <Plus className="size-4" />
                          </button>
                        );
                      }
                      return (
                        <button
                          key={colIdx} onClick={() => setSelected(seat.label)}
                          aria-label={`Seat ${seat.label}`}
                          aria-pressed={selected === seat.label}
                          className={cn(
                            'grid size-10 shrink-0 place-items-center rounded-lg border-2 text-[10px] font-extrabold tabular-nums transition',
                            isAisle && 'ms-5',
                            selected === seat.label && 'border-[#0A1E3C] bg-[#0A1E3C] text-white',
                            selected !== seat.label && seat.type === 'VIP' && 'border-amber-300 bg-amber-50 text-amber-700',
                            selected !== seat.label && seat.type === 'DISABLED' && 'border-slate-100 bg-slate-50 text-slate-300',
                            selected !== seat.label && seat.type === 'NORMAL' && 'border-slate-200 bg-white text-[#5B6B84]'
                          )}
                        >
                          {seat.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid content-start gap-4">
            <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5">
              <p className="text-[15px] font-extrabold text-[#0B1B33]">{isRTL ? 'المقعد المحدد' : 'Selected seat'}</p>
              {!sel ? (
                <p className="mt-2 text-[13.5px] text-[#5B6B84]">{isRTL ? 'اضغط على مقعد لتعديله' : 'Tap a seat to edit it'}</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  <p className="text-[16px] font-extrabold tabular-nums text-[#0B1B33]">{sel.label}</p>
                  <div className="flex gap-1.5">
                    {(['NORMAL', 'VIP', 'DISABLED'] as SeatType[]).map((tp) => (
                      <button
                        key={tp}
                        onClick={() => updateSeat(sel.label, { type: tp, price: TYPE_PRICE[tp] })}
                        aria-pressed={sel.type === tp}
                        className={cn('flex-1 rounded-lg px-2 py-2 text-[12.5px] font-bold transition', sel.type === tp ? 'bg-[#0A1E3C] text-white' : 'bg-slate-100 text-[#5B6B84]')}
                      >
                        {tp}
                      </button>
                    ))}
                  </div>
                  <V2Field label="EGP +">
                    <V2Input type="number" min="0" value={sel.price} onChange={(e) => updateSeat(sel.label, { price: Number(e.target.value) || 0 })} dir="ltr" className="tabular-nums !min-h-[48px]" />
                  </V2Field>
                  <button
                    onClick={() => removeSeat(sel.label)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2.5 text-[13.5px] font-bold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="size-4" /> {t('common.delete')}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5">
              <p className="text-[15px] font-extrabold text-[#0B1B33]">{isRTL ? 'محطات الباص' : 'Bus stations'}</p>
              <div className="mt-3 grid gap-2">
                {stations.map((s, i) => (
                  <div key={`${s.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-[#F6F8FC] px-3.5 py-2.5 text-[14px] font-semibold text-[#0B1B33]">
                    <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#0A1E3C] text-[11px] font-bold tabular-nums text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <button
                      onClick={() => setStations(stations.filter((_, x) => x !== i))}
                      aria-label="Remove station"
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-red-500 hover:bg-white"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <V2Input
                  value={newStation} onChange={(e) => setNewStation(e.target.value)}
                  placeholder={isRTL ? 'اسم المحطة' : 'Station name'}
                  aria-label={isRTL ? 'اسم المحطة' : 'Station name'}
                  className="!min-h-[48px]"
                  onKeyDown={(e) => { if (e.key === 'Enter' && newStation.trim()) { setStations([...stations, { name: newStation.trim(), order: stations.length + 1 }]); setNewStation(''); } }}
                />
                <button
                  onClick={() => { if (newStation.trim()) { setStations([...stations, { name: newStation.trim(), order: stations.length + 1 }]); setNewStation(''); } }}
                  aria-label="Add station"
                  className="grid w-12 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8] hover:bg-[#1D5BD8] hover:text-white"
                >
                  <Plus className="size-5" />
                </button>
              </div>
              <V2Button disabled={savingStations} onClick={saveStations} className="mt-3 w-full">
                {savingStations && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
              </V2Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
