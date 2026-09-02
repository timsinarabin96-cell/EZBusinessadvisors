import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createNotification } from '@/lib/notifications'
import { sendEmail } from '@/lib/email'
import { ensureAgentInvite, ensureProfileTrainingEnrollment, ONBOARDING_DASHBOARD_PATH } from '@/lib/trainingShare'

export const runtime = 'nodejs'

function absoluteUrl(req: NextRequest, path: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || req.nextUrl.origin
  return `${origin.replace(/\/$/, '')}${path}`
}

async function overview(database: any, agencyId: string) {
  const { data: memberships, error } = await database.from('agency_members')
    .select('profile_id, role, is_owner').eq('agency_id', agencyId)
  if (error) throw new Error(error.message)
  const profileIds = (memberships || []).map((member: any) => member.profile_id)
  if (!profileIds.length) return []

  const [{ data: profiles }, { data: enrollments }, { data: documents }] = await Promise.all([
    database.from('profiles').select('id, full_name, email, status').in('id', profileIds),
    database.from('agency_training_enrollments').select('id, profile_id, status, completed_at').eq('agency_id', agencyId).in('profile_id', profileIds),
    database.from('documents').select('id, title, created_at, filled_data').in('created_by', profileIds),
  ])
  const enrollmentIds = (enrollments || []).map((enrollment: any) => enrollment.id)
  const { data: tasks } = enrollmentIds.length
    ? await database.from('agency_training_tasks').select('enrollment_id, completed').in('enrollment_id', enrollmentIds)
    : { data: [] }
  const enrollmentByProfile = new Map((enrollments || []).map((enrollment: any) => [enrollment.profile_id, enrollment]))
  const profileById = new Map((profiles || []).map((profile: any) => [profile.id, profile]))

  return Promise.all((memberships || []).map(async (membership: any) => {
    const profile: any = profileById.get(membership.profile_id) || {}
    const enrollment: any = enrollmentByProfile.get(membership.profile_id) || null
    const enrollmentTasks = (tasks || []).filter((task: any) => task.enrollment_id === enrollment?.id)
    const folderDocuments = (documents || []).filter((document: any) =>
      document.filled_data?.employee_profile_id === membership.profile_id
      && document.filled_data?.agency_id === agencyId,
    )
    const files = await Promise.all(folderDocuments.map(async (document: any) => {
      const storagePath = document.filled_data?.storage_path
      const { data } = storagePath ? await database.storage.from('documents').createSignedUrl(storagePath, 3600) : { data: null }
      return { id: document.id, title: document.title, createdAt: document.created_at, url: data?.signedUrl || null }
    }))
    return {
      profileId: membership.profile_id,
      name: profile.full_name || profile.email || 'Team member',
      email: profile.email || '',
      role: membership.is_owner ? 'owner' : membership.role,
      enrollment: enrollment ? {
        status: enrollment.status,
        completedAt: enrollment.completed_at,
        completedModules: enrollmentTasks.filter((task: any) => task.completed).length,
        totalModules: enrollmentTasks.length,
      } : null,
      files,
    }
  }))
}

export async function GET(req: NextRequest) {
  const database = createServerClient()
  if (!database) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships.find((membership) => canManageAgency(auth, membership.agency_id))?.agency_id
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()
  try {
    const [{ data: agency }, members] = await Promise.all([
      database.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
      overview(database, agencyId),
    ])
    return NextResponse.json({ ok: true, agencyId, agencyName: agency?.name || 'Your agency', members })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Could not load team training' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const database = createServerClient()
  if (!database) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const body = await req.json().catch(() => ({}))
  const agencyId = String(body.agencyId || '').trim()
  const targetType = String(body.targetType || '')
  if (!agencyId || !['profile', 'email'].includes(targetType)) {
    return NextResponse.json({ ok: false, error: 'agencyId and targetType are required' }, { status: 400 })
  }
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const { data: agency } = await database.from('agencies').select('name').eq('id', agencyId).maybeSingle()
  const agencyName = agency?.name || 'your agency'
  const dashboardUrl = absoluteUrl(req, ONBOARDING_DASHBOARD_PATH)

  try {
    let profileId = targetType === 'profile' ? String(body.profileId || '').trim() : ''
    let email = targetType === 'email' ? String(body.email || '').trim().toLowerCase() : ''
    if (targetType === 'email' && email) {
      const { data: matchedProfile } = await database.from('profiles').select('id, email').ilike('email', email).maybeSingle()
      if (matchedProfile) {
        const { data: membership } = await database.from('agency_members').select('profile_id').eq('agency_id', agencyId).eq('profile_id', matchedProfile.id).maybeSingle()
        if (membership) profileId = matchedProfile.id
      }
    }

    if (profileId) {
      const { data: membership } = await database.from('agency_members').select('profile_id').eq('agency_id', agencyId).eq('profile_id', profileId).maybeSingle()
      if (!membership) return NextResponse.json({ ok: false, error: 'Target is not a member of this agency' }, { status: 404 })
      const { data: profile } = await database.from('profiles').select('email, full_name').eq('id', profileId).maybeSingle()
      email = profile?.email || email
      const enrollment = await ensureProfileTrainingEnrollment(database, agencyId, profileId)
      await createNotification({
        agency_id: agencyId,
        profile_id: profileId,
        title: 'Onboarding training assigned',
        body: `${agencyName} assigned your required five-module onboarding program.`,
        kind: 'training',
        link: ONBOARDING_DASHBOARD_PATH,
      })
      if (email) await sendEmail({
        to: email,
        subject: `You've been enrolled in ${agencyName} onboarding training — start here`,
        html: `<h2>Your onboarding training is ready</h2><p>${agencyName} shared its required agent onboarding program with you.</p><p><a href="${dashboardUrl}">Start onboarding training</a></p><p>Complete all five modules to unlock your certificate and save it to your employee file.</p>`,
        kind: 'generic',
        meta: { agency_id: agencyId, profile_id: profileId, kind: 'agent_onboarding_shared' },
      })
      return NextResponse.json({ ok: true, mode: 'profile', link: ONBOARDING_DASHBOARD_PATH, enrollment })
    }

    if (!email) return NextResponse.json({ ok: false, error: 'email is required' }, { status: 400 })
    const invite = await ensureAgentInvite(database, { agencyId, email, createdBy: auth.user.id })
    const invitePath = `/invite/${invite.token}`
    const inviteUrl = absoluteUrl(req, invitePath)
    await sendEmail({
      to: email,
      subject: `You've been enrolled in ${agencyName} onboarding training — start here`,
      html: `<h2>Join ${agencyName} and start onboarding</h2><p>Create your Concord account from this private invitation. Your required five-module onboarding program will be waiting for you.</p><p><a href="${inviteUrl}">Accept invitation and start training</a></p>`,
      kind: 'generic',
      meta: { agency_id: agencyId, invite_id: invite.id, kind: 'agent_onboarding_invite' },
    })
    return NextResponse.json({ ok: true, mode: 'email', link: invitePath, url: inviteUrl, invite: { id: invite.id, created: invite.created } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Could not share training' }, { status: 500 })
  }
}
