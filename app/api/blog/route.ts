/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { listPublishedPosts, listAllPosts, getPostBySlug, savePost, deletePost } from '@/lib/blog'

export const runtime = 'nodejs'

/**
 * /api/blog — Insights/Blog engine (audit Part C #1).
 *
 * GET  ?slug=...          — one published post (public)
 * GET                    — published posts, newest first (public)
 * GET  ?all=1             — all posts incl. drafts (broker/admin only)
 * POST { ...post }        — create/update post (broker/admin only)
 * DELETE ?slug=...        — delete post (broker/admin only)
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const slug = req.nextUrl.searchParams.get('slug')
  const all = req.nextUrl.searchParams.get('all') === '1'

  if (all) {
    const auth = await authenticateProfileRequest(req)
    if (!auth) return unauthorizedResponse()
    const isBroker = auth.profile.role === 'broker' || auth.profile.role === 'admin' || auth.profile.role === 'super_admin'
    if (!isBroker) return NextResponse.json({ ok: false, error: 'Broker access required' }, { status: 403 })
    const posts = await listAllPosts()
    return NextResponse.json({ ok: true, posts })
  }

  if (slug) {
    const post = await getPostBySlug(slug)
    if (!post) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 })
    if (!post.published) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 })
    return NextResponse.json({ ok: true, post })
  }

  const posts = await listPublishedPosts()
  return NextResponse.json({ ok: true, posts })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const isBroker = auth.profile.role === 'broker' || auth.profile.role === 'admin' || auth.profile.role === 'super_admin'
  if (!isBroker) return NextResponse.json({ ok: false, error: 'Broker access required' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
  const result = await savePost({
    slug: body.slug ? String(body.slug) : undefined,
    title: String(body.title || ''),
    excerpt: body.excerpt ? String(body.excerpt) : '',
    category: body.category ? String(body.category) : '',
    read: body.read ? String(body.read) : '',
    date: body.date ? String(body.date) : '',
    published: body.published !== false,
    sections: Array.isArray(body.sections) ? body.sections : [],
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, slug: result.slug })
}

export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const isBroker = auth.profile.role === 'broker' || auth.profile.role === 'admin' || auth.profile.role === 'super_admin'
  if (!isBroker) return NextResponse.json({ ok: false, error: 'Broker access required' }, { status: 403 })

  const slug = req.nextUrl.searchParams.get('slug') || ''
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 })
  const result = await deletePost(slug)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
