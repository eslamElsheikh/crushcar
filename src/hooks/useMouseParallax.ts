'use client'

import { useEffect, useRef, useState } from 'react'

export function useMouseParallax(strength = 0.02) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (typeof window === 'undefined' || 'ontouchstart' in window) return

    let currentX = 0
    let currentY = 0
    let targetX = 0
    let targetY = 0

    const onMove = (e: MouseEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2
      targetY = (e.clientY / window.innerHeight - 0.5) * 2
    }

    const animate = () => {
      currentX += (targetX - currentX) * 0.1
      currentY += (targetY - currentY) * 0.1
      document.documentElement.style.setProperty('--mouse-x', `${currentX}`)
      document.documentElement.style.setProperty('--mouse-y', `${currentY}`)
      rafRef.current = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return ref
}
