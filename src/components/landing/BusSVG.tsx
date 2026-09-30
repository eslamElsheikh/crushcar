'use client'

import { memo, useRef, useEffect, useCallback } from 'react'

interface BusSVGProps {
  state?: 'ambient' | 'launching' | 'nudge'
  onLaunchComplete?: () => void
}

export const BusSVG = memo(function BusSVG({ state = 'ambient', onLaunchComplete }: BusSVGProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    el.classList.remove('launching', 'nudge')
    void el.offsetWidth

    if (state === 'launching') {
      el.classList.add('launching')
    } else if (state === 'nudge') {
      el.classList.add('nudge')
      const timer = setTimeout(() => {
        el.classList.remove('nudge')
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [state])

  const handleAnimationEnd = useCallback(() => {
    if (state === 'launching') {
      onLaunchComplete?.()
    }
  }, [state, onLaunchComplete])

  return (
    <div
      ref={ref}
      className="bus-wrapper"
      onAnimationEnd={handleAnimationEnd}
      style={{ willChange: 'transform' }}
    >
      <svg viewBox="0 0 560 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
        <defs>
          <radialGradient id="headlightGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00C8FF" stopOpacity="1" />
            <stop offset="40%" stopColor="#0066FF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0066FF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A2035" />
            <stop offset="40%" stopColor="#0D1421" />
            <stop offset="100%" stopColor="#060A12" />
          </linearGradient>
          <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0A1830" stopOpacity="0.4" />
          </linearGradient>
          <radialGradient id="wheelGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2A2A2A" />
            <stop offset="70%" stopColor="#111111" />
            <stop offset="100%" stopColor="#050505" />
          </radialGradient>
          <radialGradient id="taillightGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF3333" stopOpacity="1" />
            <stop offset="100%" stopColor="#FF0000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ledStrip" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0057FF" stopOpacity="0" />
            <stop offset="20%" stopColor="#00C8FF" stopOpacity="0.9" />
            <stop offset="80%" stopColor="#0057FF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0057FF" stopOpacity="0" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        <ellipse cx="280" cy="185" rx="200" ry="8" fill="rgba(0,87,255,0.08)" filter="url(#softGlow)" />

        <polygon points="30,160 0,185 -40,185 20,160" fill="url(#headlightGlow)" opacity="0.3" className="headlight-beam" />

        <rect x="20" y="60" width="520" height="115" rx="12" ry="12" fill="url(#bodyGrad)" stroke="rgba(0,87,255,0.25)" strokeWidth="1" />
        <line x1="32" y1="61" x2="528" y2="61" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        <rect x="30" y="32" width="490" height="35" rx="16" ry="16" fill="#0F1623" stroke="rgba(0,87,255,0.2)" strokeWidth="1" />
        <line x1="42" y1="33" x2="508" y2="33" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

        {[40, 150, 260, 370].map((x, i) => (
          <g key={i}>
            <rect x={x} y="72" width="95" height="55" rx="6" fill="url(#glassGrad)" stroke="rgba(0,150,255,0.2)" strokeWidth="0.5" />
            <rect x={x + 2} y="74" width="30" height="8" rx="3" fill="rgba(255,255,255,0.06)" />
          </g>
        ))}

        <rect x="478" y="75" width="45" height="70" rx="4" fill="url(#glassGrad)" stroke="rgba(0,87,255,0.3)" strokeWidth="0.8" />
        <rect x="488" y="115" width="4" height="20" rx="2" fill="rgba(0,150,255,0.5)" />

        <rect x="28" y="130" width="510" height="2" rx="1" fill="url(#ledStrip)" className="led-strip" />
        <rect x="28" y="128" width="510" height="6" rx="3" fill="url(#ledStrip)" opacity="0.3" filter="url(#softGlow)" className="led-strip" />

        <rect x="18" y="80" width="18" height="30" rx="4" fill="#0A0F1A" stroke="rgba(0,200,255,0.4)" strokeWidth="1" />
        <rect x="16" y="85" width="4" height="20" rx="2" fill="#00C8FF" filter="url(#glow)" className="drl-light" />
        <ellipse cx="20" cy="105" rx="6" ry="8" fill="url(#headlightGlow)" className="headlight-main" />
        <ellipse cx="10" cy="97" rx="30" ry="25" fill="url(#headlightGlow)" opacity="0.5" filter="url(#softGlow)" className="headlight-halo" />

        <rect x="526" y="80" width="14" height="40" rx="4" fill="#1A0505" stroke="rgba(255,50,50,0.4)" strokeWidth="1" />
        <rect x="530" y="84" width="6" height="32" rx="3" fill="#FF2020" opacity="0.8" filter="url(#glow)" className="tail-light" />

        <text x="200" y="110" fontFamily="Cairo, sans-serif" fontSize="22" fontWeight="900" fill="rgba(255,255,255,0.12)" textAnchor="middle">CrushCar</text>

        <rect x="14" y="148" width="30" height="12" rx="4" fill="#0A0E18" stroke="rgba(0,87,255,0.3)" strokeWidth="0.5" />
        <rect x="516" y="148" width="30" height="12" rx="4" fill="#0A0E18" stroke="rgba(255,50,50,0.2)" strokeWidth="0.5" />

        {[100, 420].map((x, i) => (
          <g key={`wheel-${i}`} className="wheel" transform={`translate(${x}, 168)`}>
            <circle r="22" fill="url(#wheelGrad)" stroke="rgba(100,100,120,0.3)" strokeWidth="1.5" />
            <circle r="22" fill="none" stroke="rgba(60,60,80,0.5)" strokeWidth="3" strokeDasharray="8 6" />
            <circle r="14" fill="#1A1A2E" stroke="rgba(0,87,255,0.4)" strokeWidth="1" />
            <line x1="0" y1="-13" x2="0" y2="13" stroke="rgba(0,87,255,0.5)" strokeWidth="1.5" />
            <line x1="-13" y1="0" x2="13" y2="0" stroke="rgba(0,87,255,0.5)" strokeWidth="1.5" />
            <line x1="-9" y1="-9" x2="9" y2="9" stroke="rgba(0,87,255,0.3)" strokeWidth="1" />
            <line x1="9" y1="-9" x2="-9" y2="9" stroke="rgba(0,87,255,0.3)" strokeWidth="1" />
            <circle r="4" fill="#0057FF" opacity="0.8" />
            <circle r="2" fill="#00C8FF" />
          </g>
        ))}

        <circle id="exhaust-origin" cx="545" cy="158" r="1" fill="none" />
      </svg>
    </div>
  )
})
