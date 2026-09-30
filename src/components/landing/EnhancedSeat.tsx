'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

type SeatState = 'available' | 'selected' | 'reserved' | 'vip'

interface EnhancedSeatProps {
  label: string
  state: SeatState
  onSelect?: (label: string) => void
  index?: number
}

const stateClasses: Record<SeatState, string> = {
  available: 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-blue-500/20 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/20 seat-breathe-free',
  selected: 'bg-blue-500 border border-blue-400 text-white shadow-lg shadow-blue-500/40 seat-breathe-mine',
  reserved: 'bg-red-500/20 border border-red-500/30 text-red-400 cursor-not-allowed seat-breathe-taken',
  vip: 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25',
}

export const EnhancedSeat = memo(function EnhancedSeat({ label, state, onSelect, index = 0 }: EnhancedSeatProps) {
  return (
    <motion.div
      layoutId={`seat-${label}`}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: 0.9 + index * 0.05, type: 'spring', stiffness: 300 }}
      whileHover={state === 'available' ? { scale: 1.15, y: -2 } : state === 'vip' ? { scale: 1.1 } : {}}
      whileTap={state === 'available' ? { scale: 0.9 } : {}}
      onClick={() => state === 'available' && onSelect?.(label)}
      className={cn(
        'relative aspect-square rounded-xl flex items-center justify-center text-xs font-semibold transition-all duration-300 cursor-pointer',
        stateClasses[state]
      )}
    >
      {label}
      {state === 'reserved' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-0.5 bg-red-500/60 rotate-45" />
        </div>
      )}
    </motion.div>
  )
})
