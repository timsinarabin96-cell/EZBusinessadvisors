'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    const redirectToSignIn = () => {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : ''
      router.replace(`/auth${next}`)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error || !data.session) {
        redirectToSignIn()
        return
      }
      setReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (!session) {
        setReady(false)
        redirectToSignIn()
      } else {
        setReady(true)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [pathname, router])

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>
        <div style={{ color: 'var(--navy)', fontFamily: 'Georgia, serif', fontSize: 18 }}>
          Securing your workspace…
        </div>
      </div>
    )
  }

  return <>{children}</>
}
