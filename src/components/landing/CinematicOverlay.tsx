'use client'

import { useState, useCallback, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface CinematicOverlayProps {
  isActive: boolean
  onComplete: () => void
  children?: React.ReactNode
}

interface DustParticle {
  id: number
  x: number
  y: number
  size: number
  vx: number
  vy: number
  duration: number
  opacity: number
}

export const CinematicOverlay = memo(function CinematicOverlay({ isActive, onComplete, children }: CinematicOverlayProps) {
  const [phase, setPhase] = useState<'idle' | 'dimming' | 'charging' | 'launching' | 'wiping' | 'complete'>('idle')
  const [dustParticles, setDustParticles] = useState<DustParticle[]>([])

  const startSequence = useCallback(() => {
    setPhase('dimming')
    document.body.style.overflow = 'hidden'

    setTimeout(() => setPhase('charging'), 400)
    setTimeout(() => {
      setPhase('launching')
      const particles = Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: 30 + (Math.random() - 0.3) * 60,
        y: 50 + (Math.random() - 0.5) * 30,
        size: 20 + Math.random() * 40,
        vx: 20 + Math.random() * 80,
        vy: (Math.random() - 0.7) * 30,
        duration: 800 + Math.random() * 700,
        opacity: 0.3 + Math.random() * 0.5,
      }))
      setDustParticles(particles)
      setTimeout(() => setDustParticles([]), 2000)
    }, 900)
    setTimeout(() => setPhase('wiping'), 1800)
    setTimeout(() => {
      setPhase('complete')
      onComplete()
    }, 2400)
  }, [onComplete])

  useEffect(() => {
    if (isActive && phase === 'idle') {
      startSequence()
    }
  }, [isActive, phase, startSequence])

  useEffect(() => {
    if (phase === 'complete') {
      document.body.style.overflow = ''
    }
  }, [phase])

  const reset = useCallback(() => {
    setPhase('idle')
    setDustParticles([])
    document.body.style.overflow = ''
  }, [])

  return (
    <AnimatePresence>
      {phase !== 'idle' && phase !== 'complete' && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 45,
              background: 'radial-gradient(ellipse at center, transparent 0%, rgba(2,4,8,0.8) 100%)',
              pointerEvents: 'none',
            }}
          />

          {dustParticles.map((p) => (
            <div
              key={p.id}
              className="dust-particle"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                opacity: p.opacity,
                animationDuration: `${p.duration}ms`,
              }}
            />
          ))}

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: (phase === 'wiping' || phase === ('complete' as string)) ? 1 : 0 }}
            transition={{ duration: 0.5, ease: [0.7, 0, 0.3, 1] }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              background: 'linear-gradient(90deg, #020408 0%, #030712 100%)',
              transformOrigin: 'right center',
            }}
          />
        </>
      )}
    </AnimatePresence>
  )
})
