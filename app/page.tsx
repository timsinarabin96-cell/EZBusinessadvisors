'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        router.replace('/dashboard')
      } else {
        router.replace('/auth')
      }
    })()
  }, [router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>CONCORD</div>
        <div style={{ color: '#c9a84c', letterSpacing: '0.3em', fontSize: 11, textTransform: 'uppercase', marginTop: 4 }}>Deal Platform</div>
        <div style={{ height: 2, width: 56, background: '#c9a84c', margin: '14px auto' }} />
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 20 }}>Loading…</div>
      </div>
    </div>
  )
}
