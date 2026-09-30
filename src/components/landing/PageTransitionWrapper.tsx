'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CinematicOverlay } from './CinematicOverlay'
import { BusSVG } from './BusSVG'

interface PageTransitionWrapperProps {
  children: React.ReactNode
  showBus?: boolean
}

export function PageTransitionWrapper({ children, showBus = true }: PageTransitionWrapperProps) {
  const router = useRouter()
  const [cinematicActive, setCinematicActive] = useState(false)
  const [busState, setBusState] = useState<'ambient' | 'launching' | 'nudge'>('ambient')
  const [roadAccelerating, setRoadAccelerating] = useState(false)
  const [roadFading, setRoadFading] = useState(false)

  const triggerCinematic = useCallback((href: string) => {
    setCinematicActive(true)
    setBusState('launching')
    setRoadAccelerating(true)

    setTimeout(() => setRoadFading(true), 900)

    setTimeout(() => {
      router.push(href)
    }, 2400)
  }, [router])

  const handleLaunchComplete = useCallback(() => {
    setBusState('ambient')
  }, [])

  useEffect(() => {
    if (roadFading) {
      const roadEl = document.querySelector('.road')
      roadEl?.classList.add('fading')
    }
    if (roadAccelerating) {
      const lineEl = document.querySelector('.road-center-line')
      lineEl?.classList.add('accelerating')
    }
  }, [roadAccelerating, roadFading])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const btn = target.closest('[data-cinematic]')
      if (btn) {
        e.preventDefault()
        const href = btn.getAttribute('href') || btn.getAttribute('data-cinematic-href') || '/trips'
        triggerCinematic(href)
      }
    }

    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [triggerCinematic])

  return (
    <>
      {children}

      {showBus && (
        <BusSVG state={busState} onLaunchComplete={handleLaunchComplete} />
      )}

      <CinematicOverlay
        isActive={cinematicActive}
        onComplete={() => {
          setCinematicActive(false)
          setBusState('ambient')
          setRoadAccelerating(false)
          setRoadFading(false)
          const roadEl = document.querySelector('.road')
          roadEl?.classList.remove('fading')
          const lineEl = document.querySelector('.road-center-line')
          lineEl?.classList.remove('accelerating')
        }}
      />
    </>
  )
}
