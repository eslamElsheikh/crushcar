'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface ActivityEvent {
  id: number
  name: string
  type: 'booked' | 'reserved' | 'available'
  seat: string
  dot: string
  ar: string
}

const NAMES = ['أحمد', 'محمد', 'سارة', 'نور', 'خالد', 'ريم', 'عمر', 'لينا', 'فاطمة', 'حسن', 'مريم', 'يوسف']
const SEATS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4', 'E1', 'E2', 'E3']
const EVENTS = [
  { type: 'booked' as const, ar: 'حجز المقعد', dot: '#F85149' },
  { type: 'reserved' as const, ar: 'حجز المقعد', dot: '#FFB347' },
  { type: 'available' as const, ar: 'أصبح المقعد متاحاً', dot: '#00D48B' },
]

export function useActivityToasts(maxVisible = 3, interval = [3000, 7000]) {
  const [toasts, setToasts] = useState<ActivityEvent[]>([])
  const idRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const scheduleNext = useCallback(() => {
    const delay = interval[0] + Math.random() * (interval[1] - interval[0])
    timeoutRef.current = setTimeout(() => {
      const event = EVENTS[Math.floor(Math.random() * EVENTS.length)]
      const name = NAMES[Math.floor(Math.random() * NAMES.length)]
      const seat = SEATS[Math.floor(Math.random() * SEATS.length)]

      const newToast: ActivityEvent = {
        id: ++idRef.current,
        name,
        type: event.type,
        seat,
        dot: event.dot,
        ar: event.ar,
      }

      setToasts(prev => {
        const updated = [...prev, newToast]
        return updated.slice(-maxVisible)
      })

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id))
      }, 4000)

      scheduleNext()
    }, delay)
  }, [maxVisible, interval])

  useEffect(() => {
    scheduleNext()
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [scheduleNext])

  return toasts
}
