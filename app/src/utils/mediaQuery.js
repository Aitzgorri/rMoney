import { useState, useEffect } from 'react'

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = e => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}

export const DESKTOP = '(min-width: 1024px)'
// Phone-width viewports — used to give SVG charts a smaller viewBox so axis
// labels don't shrink into illegibility when the chart fills a narrow screen.
export const PHONE = '(max-width: 640px)'
