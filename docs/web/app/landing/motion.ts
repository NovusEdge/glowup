import { useEffect, useState } from 'react'

// Both hooks start from the server's answer and correct it in an effect, so the first client render matches the HTML.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export function useVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible')
    on()
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}
