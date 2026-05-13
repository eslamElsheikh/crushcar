'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Loader2, Trash2, Plus, Minus, Bus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SeatDraft {
  label: string
  row: number
  col: number
  type: 'NORMAL' | 'VIP' | 'DISABLED'
  price: number
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
const MAX_ROWS = 12

const seatTypeStyle: Record<string, string> = {
  NORMAL: 'seat-available',
  VIP: 'seat-vip',
  DISABLED: 'seat-disabled',
}

const seatTypeConfig: Record<string, { label: string; labelAr: string; price: number }> = {
  NORMAL: { label: 'Normal', labelAr: 'عادي', price: 0 },
  VIP: { label: 'VIP', labelAr: 'VIP', price: 50 },
  DISABLED: { label: 'Disabled', labelAr: 'معاق', price: 0 },
}

export default function BusLayoutPage() {
  const params = useParams()
  const router = useRouter()
  const busId = params.id as string

  const [bus, setBus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSeat, setSelectedSeat] = useState<SeatDraft | null>(null)
  const [seats, setSeats] = useState<SeatDraft[]>([])
  const [totalRows, setTotalRows] = useState(10)
  // colsPerRow: how many seats in each row (e.g., { A: 4, B: 4, C: 3 })
  const [colsPerRow, setColsPerRow] = useState<Record<string, number>>({})
  const [aisleAfter, setAisleAfter] = useState(2) // e.g., 2 = aisle after column 2

  useEffect(() => {
    loadBus()
  }, [busId])

  async function loadBus() {
    const res = await fetch(`/api/buses/${busId}`)
    const data = await res.json()
    setBus(data)
    if (data.layout?.seats?.length) {
      // Parse existing layout
      setTotalRows(data.layout.rows)
      setAisleAfter(data.layout.aisleAfter || 2)

      // Parse colsPerRow from JSON string
      let parsedCols: Record<string, number> = {}
      if (data.layout.colsPerRow) {
        try {
          parsedCols = JSON.parse(data.layout.colsPerRow)
        } catch {
          // fallback: all rows have same cols
          const maxCol = Math.max(...data.layout.seats.map((s: any) => s.col))
          ROWS.forEach((_, i) => {
            if (i < data.layout.rows) {
              parsedCols[ROWS[i]] = data.layout.cols
            }
          })
        }
      } else {
        // Initialize from existing seats
        const maxCol = Math.max(...data.layout.seats.map((s: any) => s.col))
        ROWS.forEach((_, i) => {
          if (i < data.layout.rows) {
            parsedCols[ROWS[i]] = data.layout.cols
          }
        })
      }
      setColsPerRow(parsedCols)

      setSeats(
        data.layout.seats.map((s: any) => ({
          label: s.label,
          row: s.row,
          col: s.col,
          type: s.type as 'NORMAL' | 'VIP' | 'DISABLED',
          price: s.price,
        }))
      )
    } else {
      // Initialize default: 10 rows, 4 seats each
      const defaultCols: Record<string, number> = {}
      for (let i = 0; i < 10; i++) {
        defaultCols[ROWS[i]] = 4
      }
      setColsPerRow(defaultCols)
      setTotalRows(10)
    }
    setLoading(false)
  }

  function getSeatAt(row: number, col: number) {
    return seats.find((s) => s.row === row && s.col === col)
  }

  function getRowSeatCount(rowLetter: string): number {
    return colsPerRow[rowLetter] || 4
  }

  function addSeat(row: number, col: number) {
    if (getSeatAt(row, col)) return
    const label = `${ROWS[row]}${col}`
    const newSeat: SeatDraft = {
      label,
      row,
      col,
      type: 'NORMAL',
      price: seatTypeConfig.NORMAL.price,
    }
    setSeats([...seats, newSeat])
    setSelectedSeat(newSeat)
  }

  function removeSeat(row: number, col: number) {
    setSeats(seats.filter((s) => !(s.row === row && s.col === col)))
    if (selectedSeat?.row === row && selectedSeat?.col === col) {
      setSelectedSeat(null)
    }
  }

  function updateSeat(label: string, updates: Partial<SeatDraft>) {
    setSeats(seats.map((s) => (s.label === label ? { ...s, ...updates } : s)))
    if (selectedSeat?.label === label) {
      setSelectedSeat({ ...selectedSeat, ...updates })
    }
  }

  function setRowCount(rowLetter: string, count: number) {
    const newCount = Math.max(0, Math.min(6, count))
    const oldCount = colsPerRow[rowLetter] || 4

    // Remove seats that exceed new count
    setSeats(seats.filter(s => {
      if (s.row !== ROWS.indexOf(rowLetter)) return true
      return s.col <= newCount
    }))

    // Also adjust selected seat if it's beyond new count
    if (selectedSeat && ROWS[selectedSeat.row] === rowLetter && selectedSeat.col > newCount) {
      setSelectedSeat(null)
    }

    setColsPerRow({ ...colsPerRow, [rowLetter]: newCount })
  }

  function addRow() {
    if (totalRows >= MAX_ROWS) return
    const newRow = totalRows
    setColsPerRow({ ...colsPerRow, [ROWS[newRow]]: 4 })
    setTotalRows(totalRows + 1)
  }

  function removeRow() {
    if (totalRows <= 1) return
    const removedRow = totalRows - 1
    // Remove all seats in the last row
    setSeats(seats.filter(s => s.row !== removedRow))
    if (selectedSeat && selectedSeat.row === removedRow) {
      setSelectedSeat(null)
    }
    const newCols = { ...colsPerRow }
    delete newCols[ROWS[removedRow]]
    setColsPerRow(newCols)
    setTotalRows(totalRows - 1)
  }

  async function handleSave() {
    setSaving(true)

    // Build colsPerRow JSON string
    const colsPerRowJSON = JSON.stringify(colsPerRow)

    const res = await fetch(`/api/buses/${busId}/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: totalRows,
        cols: 6, // max columns for grid rendering
        aisleAfter,
        colsPerRow: colsPerRowJSON,
        seats,
      }),
    })
    setSaving(false)
    if (res.ok) {
      router.push('/admin/buses')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push('/admin/buses')}
          className="p-2.5 rounded-xl glass hover:bg-zinc-800/50 border border-white/5 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Bus size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">{bus?.name}</h1>
            <p className="text-zinc-400 text-sm">تصميم مقاعد الباص</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 transition-all"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'جارِ الحفظ...' : 'حفظ التصميم'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,300px] gap-6">
        {/* Seat Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-8 border border-white/5 shadow-2xl"
        >
          {/* Bus front indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full glass border border-white/5">
              <span className="text-lg">🚌</span>
              <span className="text-xs font-medium text-zinc-500">الأمام — FRONT</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 overflow-x-auto">
            {Array.from({ length: totalRows }, (_, rowIdx) => {
              const rowLetter = ROWS[rowIdx]
              const rowSeatCount = getRowSeatCount(rowLetter)

              return (
                <div key={rowIdx} className="flex items-center gap-2">
                  {/* Row label */}
                  <div className="w-8 flex items-center justify-center text-xs text-zinc-600 font-bold">
                    {rowLetter}
                  </div>

                  {/* Seats in this row */}
                  <div className="flex gap-1.5">
                    {Array.from({ length: rowSeatCount }, (_, colIdx) => {
                      const col = colIdx + 1
                      const seat = getSeatAt(rowIdx, col)
                      const isAisle = rowSeatCount > 3 && col === aisleAfter + 1

                      if (isAisle) {
                        return (
                          <div key="aisle-gap" className="w-6 shrink-0" />
                        )
                      }

                      return (
                        <div key={colIdx}>
                          {seat ? (
                            <motion.div
                              whileHover={{ scale: 1.1, y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setSelectedSeat(seat)}
                              className={cn(
                                'w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold cursor-pointer transition-all shadow-md',
                                seatTypeStyle[seat.type] || 'seat-available',
                                selectedSeat?.label === seat.label && 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-105'
                              )}
                            >
                              {seat.label}
                            </motion.div>
                          ) : (
                            <button
                              onClick={() => addSeat(rowIdx, col)}
                              className="w-12 h-12 rounded-xl border-2 border-dashed border-zinc-700/50 hover:border-blue-500/30 hover:bg-blue-500/5 transition flex items-center justify-center text-zinc-600 hover:text-blue-400 text-lg font-light"
                              title={`Add seat ${rowLetter}${col}`}
                            >
                              +
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Row seat count control */}
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => setRowCount(rowLetter, (colsPerRow[rowLetter] || 4) - 1)}
                      disabled={(colsPerRow[rowLetter] || 4) <= 0}
                      className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition disabled:opacity-30 text-xs"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-xs text-zinc-500 w-6 text-center font-mono">
                      {colsPerRow[rowLetter] || 4}
                    </span>
                    <button
                      onClick={() => setRowCount(rowLetter, (colsPerRow[rowLetter] || 4) + 1)}
                      disabled={(colsPerRow[rowLetter] || 4) >= 6}
                      className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition disabled:opacity-30 text-xs"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Aisle label */}
          <div className="flex justify-center mt-8">
            <div className="text-[10px] text-zinc-700 uppercase tracking-widest px-3 py-1 rounded bg-zinc-800/30">
              الممر — AISLE
            </div>
          </div>

          {/* Row add/remove controls */}
          <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t border-white/5">
            <button
              onClick={removeRow}
              disabled={totalRows <= 1}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm transition disabled:opacity-30"
            >
              <Minus size={14} />
              إزالة صف
            </button>
            <div className="px-4 py-2 rounded-xl glass text-sm text-zinc-400">
              {totalRows} {totalRows === 1 ? 'صف' : 'صفوف'}
              <span className="mx-2 text-zinc-700">•</span>
              {seats.length} مقعد
            </div>
            <button
              onClick={addRow}
              disabled={totalRows >= MAX_ROWS}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-blue-500/20 text-blue-400 hover:bg-blue-500/10 text-sm transition disabled:opacity-30"
            >
              <Plus size={14} />
              إضافة صف
            </button>
          </div>
        </motion.div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          {/* Stats */}
          <div className="glass rounded-2xl p-6 border border-white/5">
            <h3 className="font-semibold mb-4 text-sm text-zinc-300">معلومات التصميم</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">عدد الصفوف</span>
                <span className="font-semibold text-white">{totalRows}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">عدد المقاعد</span>
                <span className="font-bold text-blue-400 text-lg">{seats.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">المقاعد المحجوزة</span>
                <span className="font-semibold text-zinc-400">—</span>
              </div>
            </div>
          </div>

          {/* Aisle position */}
          <div className="glass rounded-2xl p-6 border border-white/5">
            <h3 className="font-semibold mb-4 text-sm text-zinc-300">موضع الممر</h3>
            <div className="flex gap-2">
              {[1, 2, 3].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setAisleAfter(pos)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-xs font-medium transition border',
                    aisleAfter === pos
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                      : 'border-zinc-700 hover:border-zinc-600 text-zinc-400'
                  )}
                >
                  بعد المقعد {pos}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="glass rounded-2xl p-6 border border-white/5">
            <h3 className="font-semibold mb-4 text-sm text-zinc-300">أنواع المقاعد</h3>
            <div className="space-y-3">
              {Object.entries(seatTypeConfig).map(([type, cfg]) => (
                <div key={type} className="flex items-center gap-3">
                  <div className={cn('w-8 h-8 rounded-lg flex-shrink-0', seatTypeStyle[type])} />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{cfg.labelAr}</span>
                    <span className="text-xs text-zinc-500 ml-1">/ {cfg.label}</span>
                  </div>
                  <span className="text-xs text-zinc-600">+{cfg.price} EGP</span>
                </div>
              ))}
            </div>
          </div>

          {/* Seat editor */}
          {selectedSeat && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass rounded-2xl p-6 border border-blue-500/10 shadow-xl shadow-blue-500/5"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold', seatTypeStyle[selectedSeat.type])}>
                    {selectedSeat.label}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">تعديل المقعد</h3>
                    <p className="text-xs text-zinc-500">Edit seat {selectedSeat.label}</p>
                  </div>
                </div>
                <button
                  onClick={() => removeSeat(selectedSeat.row, selectedSeat.col)}
                  className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Type */}
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block uppercase tracking-wider">النوع</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(seatTypeConfig).map(([type, cfg]) => (
                      <button
                        key={type}
                        onClick={() => updateSeat(selectedSeat.label, { type: type as any, price: cfg.price })}
                        className={cn(
                          'px-3 py-2.5 rounded-xl text-xs font-semibold transition border',
                          selectedSeat.type === type
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                            : 'border-zinc-700 hover:border-zinc-600 text-zinc-400'
                        )}
                      >
                        {cfg.labelAr}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Extra price */}
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block uppercase tracking-wider">
                    السعر الإضافي (EGP)
                  </label>
                  <input
                    type="number"
                    value={selectedSeat.price}
                    onChange={(e) => updateSeat(selectedSeat.label, { price: Number(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 border border-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition text-white font-medium"
                    min={0}
                    placeholder="0"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  )
}