/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

// Desktop push notifications — request permission, subscribe the browser to
// web push, and send a test notification. Uses the VAPID public key baked
// into the build (NEXT_PUBLIC_VAPID_PUBLIC_KEY).
export default function PushNotifications() {
  const toast = useToast()
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')

  const refreshState = useCallback(async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false)
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)
    const reg = await navigator.serviceWorker.getRegistration()
    if (reg && (await reg.pushManager.getSubscription())) {
      setEnabled(true)
    } else {
      setEnabled(false)
    }
  }, [])

  useEffect(() => { refreshState().catch(() => {}) }, [refreshState])

  const enable = async () => {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        toast('Notifications blocked — allow them in your browser settings.', 'error')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim(),
        ),
      })
      const { authenticatedFetch } = await import('@/lib/authenticatedFetch')
      const res = await authenticatedFetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save subscription')
      setEnabled(true)
      toast('Desktop notifications enabled ✅', 'success')
    } catch (e) {
      console.error('Push enable failed:', e)
      toast('Could not enable notifications: ' + (e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        const { authenticatedFetch } = await import('@/lib/authenticatedFetch')
        await authenticatedFetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: 'DELETE',
        }).catch(() => {})
        await sub.unsubscribe()
      }
      setEnabled(false)
      toast('Notifications disabled.', 'success')
    } catch (e) {
      toast('Could not disable: ' + (e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const { authenticatedFetch } = await import('@/lib/authenticatedFetch')
      const res = await authenticatedFetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Concord test notification 🔔', body: 'Your deal alerts are live. This is a test push.' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed')
      toast(data.sent ? 'Test notification sent ✅' : 'No devices subscribed yet.', 'success')
    } catch (e) {
      toast('Test failed: ' + (e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title="🔔 Desktop Push Notifications" subtitle="Get deal alerts, follow-up reminders, and activity updates right in your browser — even when this tab is closed." />
      <div style={{ padding: '0 20px 20px' }}>
        {!supported ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Your browser doesn't support push notifications. Try Chrome, Edge, or Safari.
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span
              style={{
                width: 12, height: 12, borderRadius: '50%',
                background: enabled ? '#22c55e' : permission === 'denied' ? '#ef4444' : '#cbd5e1',
              }}
            />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {enabled ? 'Notifications enabled' : permission === 'denied' ? 'Blocked by browser' : 'Notifications off'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {enabled
                  ? 'New alerts will pop up as push notifications.'
                  : permission === 'denied'
                    ? 'Unblock notifications for this site in your browser settings, then reload.'
                    : 'Turn on push notifications to never miss a deal update.'}
              </div>
            </div>
            {!enabled ? (
              <button className="btn btn-primary" onClick={enable} disabled={busy || permission === 'denied'}>
                {busy ? 'Enabling…' : 'Enable notifications'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={test} disabled={busy}>Send test</button>
                <button className="btn btn-ghost" onClick={disable} disabled={busy}>Disable</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}
