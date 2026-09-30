'use client'

import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useActivityToasts } from '@/hooks/useActivityToasts'

interface ActivityToastProps {
  event: {
    id: number
    name: string
    type: 'booked' | 'reserved' | 'available'
    seat: string
    dot: string
    ar: string
  }
}

export const ActivityToast = memo(function ActivityToast({ event }: ActivityToastProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 60, scale: 0.85 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.85, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      className="activity-toast"
      dir="rtl"
    >
      <span className="toast-dot" style={{ background: event.dot }}>
        <span className="toast-dot-ping" style={{ background: event.dot }} />
      </span>

      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-white">{event.name}</span>
        <span className="text-xs text-zinc-400">
          {event.ar} <span className="text-blue-400 font-mono font-semibold">{event.seat}</span>
        </span>
      </div>

      <motion.div
        className="toast-progress"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 4, ease: 'linear' }}
        style={{ background: event.dot }}
      />
    </motion.div>
  )
})

export function ActivityToastContainer() {
  const toasts = useActivityToasts(3, [3000, 7000])

  return (
    <div className="fixed bottom-6 left-6 z-[30] flex flex-col gap-3 toast-container pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ActivityToast key={toast.id} event={toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}
