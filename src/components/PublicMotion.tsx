import { useEffect } from 'react'

const revealSelector = '.approach-copy,.services-heading,.home-proof>div:first-child,.home-ai-copy,.home-marketing,.home-projects>div:first-child,.home-process>h2,.contact>h2,.page-intro,.page-cta,.ai-section-head'
const surfaceSelector = '.home-ai-visual,.ai-hero-system,.projects-empty,.home-projects,.services-interface'

/** Decorative motion only; content and controls work without this component. */
export function PublicMotion() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return

    const targets = [...document.querySelectorAll<HTMLElement>(revealSelector)]
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('in-frame')
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' })
    targets.forEach((element) => observer.observe(element))
    document.documentElement.classList.add('public-motion')

    let frame = 0
    const updateProgress = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const range = Math.max(1, document.documentElement.scrollHeight - innerHeight)
        document.documentElement.style.setProperty('--site-progress', `${Math.min(100, scrollY / range * 100)}%`)
      })
    }
    updateProgress()
    addEventListener('scroll', updateProgress, { passive: true })
    addEventListener('resize', updateProgress)

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    let currentSurface: HTMLElement | null = null
    const onPointer = (event: PointerEvent) => {
      if (!finePointer.matches) return
      const surface = (event.target as Element).closest?.(surfaceSelector) as HTMLElement | null
      if (currentSurface && currentSurface !== surface) {
        currentSurface.style.removeProperty('--pointer-x')
        currentSurface.style.removeProperty('--pointer-y')
      }
      currentSurface = surface
      if (!surface) return
      const rect = surface.getBoundingClientRect()
      surface.style.setProperty('--pointer-x', `${(((event.clientX - rect.left) / rect.width - 0.5) * 20).toFixed(1)}px`)
      surface.style.setProperty('--pointer-y', `${(((event.clientY - rect.top) / rect.height - 0.5) * 20).toFixed(1)}px`)
    }
    addEventListener('pointermove', onPointer, { passive: true })

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      removeEventListener('scroll', updateProgress)
      removeEventListener('resize', updateProgress)
      removeEventListener('pointermove', onPointer)
      currentSurface?.style.removeProperty('--pointer-x')
      currentSurface?.style.removeProperty('--pointer-y')
      document.documentElement.classList.remove('public-motion')
      document.documentElement.style.removeProperty('--site-progress')
    }
  }, [])
  return null
}
