import { useEffect, useState } from 'react'

export type OrientationState = 'portrait' | 'landscape'

export interface OrientationInfo {
  isPortrait: boolean
  orientation: OrientationState
  width: number
  height: number
}

function checkIsPortrait(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerHeight >= window.innerWidth
}

export function useOrientation(): OrientationInfo {
  const [isPortrait, setIsPortrait] = useState<boolean>(checkIsPortrait)
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 820,
    height: typeof window !== 'undefined' ? window.innerHeight : 1180,
  }))

  useEffect(() => {
    function handleOrientationChange() {
      const portrait = checkIsPortrait()
      setIsPortrait(portrait)
      if (typeof window !== 'undefined') {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        })
      }
    }

    handleOrientationChange()
    window.addEventListener('resize', handleOrientationChange)
    window.addEventListener('orientationchange', handleOrientationChange)

    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationChange)
    }

    return () => {
      window.removeEventListener('resize', handleOrientationChange)
      window.removeEventListener('orientationchange', handleOrientationChange)
      if (typeof screen !== 'undefined' && screen.orientation) {
        screen.orientation.removeEventListener('change', handleOrientationChange)
      }
    }
  }, [])

  return {
    isPortrait,
    orientation: isPortrait ? 'portrait' : 'landscape',
    width: dimensions.width,
    height: dimensions.height,
  }
}
