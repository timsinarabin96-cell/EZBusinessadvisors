'use client'

import { useCallback, useEffect, useState } from 'react'
import { Chip, EmptyState, PCard, Skeleton, SoftButton } from '@/components/ui/premium'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase/client'

interface TeamMemberTraining {
  profileId: string
  name: string
  email: string
  role: string
  enrollment: null | { status: string; completedAt: string | null; completedModules: number; totalModules: number }
  files: { id: string; title: string; createdAt: string; url: string | null }[]
}

export function TeamTrainingPanel() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState('')
  const [members, setMembers] = useState<TeamMemberTraining[]>([])
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState('')

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession()
    return fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, ...(init?.headers || {}) },
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const response = await request('/api/training/share')
    const json = await response.json().catch(() => ({}))
    if (response.ok) {
      setAgencyId(json.agencyId)
      setMembers(json.members || [])
    } else toast(json.error || 'Could not load employee files', 'error')
    setLoading(false)
  }, [request, toast])

  useEffect(() => { void load() }, [load])

  async function share(profileId: string) {
    setSharing(profileId)
    const response = await request('/api/training/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'profile', profileId, agencyId }),
    })
    const json = await response.json().catch(() => ({}))
    setSharing('')
    if (!response.ok) return toast(json.error || 'Could not share training', 'error')
    toast(json.enrollment?.created ? 'Training assigned and emailed.' : 'Training link emailed again.', 'success')
    await load()
  }

  if (loading) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={112} /><Skeleton h={112} /></div>
  if (!members.length) return <EmptyState icon="👥" title="No employees yet" sub="Invite an agent to start building your team." />

  return <div style={{ display: 'grid', gap: 14 }}>
    {members.map((member) => {
      const enrollment = member.enrollment
      const status = !enrollment ? <Chip tone="gray">Not enrolled</Chip>
        : enrollment.status === 'completed' ? <Chip tone="green">Completed {enrollment.completedAt ? new Date(enrollment.completedAt).toLocaleDateString() : ''}</Chip>
          : <Chip tone="gold">In progress ({enrollment.completedModules}/{enrollment.totalModules || 5})</Chip>
      return <PCard key={member.profileId} title={<div>{member.name}<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 500 }}>{member.email} · {member.role}</div></div>} actions={status}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 750, marginBottom: 8 }}>Employee Files</div>
            {member.files.length ? member.files.map((file) => file.url
              ? <a key={file.id} href={file.url} target="_blank" rel="noreferrer" style={{ display: 'block', color: '#8a6415', marginBottom: 5 }}>📄 {file.title}</a>
              : <div key={file.id}>📄 {file.title}</div>)
              : <span style={{ color: 'var(--muted)', fontSize: 13 }}>No employee documents saved yet.</span>}
          </div>
          {enrollment?.status !== 'completed' && <SoftButton onClick={() => void share(member.profileId)} disabled={sharing === member.profileId}>
            {sharing === member.profileId ? 'Sharing…' : enrollment ? 'Resend training' : 'Share training'}
          </SoftButton>}
        </div>
      </PCard>
    })}
  </div>
}
