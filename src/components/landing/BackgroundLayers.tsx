'use client'

import { memo } from 'react'
import { useMouseParallax } from '@/hooks/useMouseParallax'

function BlobField() {
  return (
    <>
      <div className="blob-1" />
      <div className="blob-2" />
      <div className="blob-3" />
    </>
  )
}

function CSSParticles() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: (i * 83 + 17) % 100,
    y: (i * 53 + 29) % 100,
    size: 1 + (i % 3),
    duration: 6 + (i % 5) * 2,
    delay: i * 0.7,
    opacity: 0.15 + (i % 4) * 0.08,
  }))

  return (
    <>
      {particles.map((p) => (
        <div
          key={p.id}
          className="css-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `rgba(0,150,255,${p.opacity})`,
            animation: `float-gentle ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </>
  )
}

export const BackgroundLayers = memo(function BackgroundLayers() {
  useMouseParallax()

  return (
    <>
      <div className="bg-void-animated" />
      <BlobField />
      <div className="grid-overlay" />
      <CSSParticles />
      <div className="road">
        <div className="road-center-line" />
      </div>
    </>
  )
})
