/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Training gamification core — pure, testable XP / streak / tier logic.
// The CBI program rewards completion so agents don't stall: lessons award XP,
// quiz passes award more, module certificates are the big milestone, and
// titles ladder up from Associate → Senior → Master CBI.
// =============================================================================

export const XP = {
  lesson_complete: 20,
  quiz_pass: 40,
  module_certified: 100,
  program_certified: 300,
  streak_bonus: (days: number) => Math.min(days, 30) * 5, // daily streak bonus, capped
} as const

export type CbiTier = 'associate' | 'senior' | 'master'

export type GamificationActivity = 'lesson_complete' | 'quiz_pass' | 'module_certified' | 'program_certified'

export interface GamificationState {
  xp: number
  current_streak: number
  best_streak: number
  modules_certified: number
  program_certified: boolean
}

/** DB row = gamification state + activity timestamps. */
export interface GamificationRow extends GamificationState {
  last_active_at: string | null
  updated_at?: string | null
}

export interface GamificationDelta {
  xp: number
  current_streak: number
  best_streak: number
}

/** Title tier from total XP — the visible career ladder. */
export function tierForXp(xp: number): CbiTier {
  if (xp >= 1200) return 'master'
  if (xp >= 500) return 'senior'
  return 'associate'
}

export const TIER_LABEL: Record<CbiTier, string> = {
  associate: 'Associate CBI',
  senior: 'Senior CBI',
  master: 'Master CBI',
}

export const TIER_ICON: Record<CbiTier, string> = {
  associate: '🥉',
  senior: '🥈',
  master: '🥇',
}

/**
 * Compute the gamification delta after a single activity.
 * `lastActiveAt` drives the streak: same-day activity keeps it, yesterday
 * extends it, anything older resets to 1.
 */
export function applyActivity(
  state: GamificationState,
  activity: GamificationActivity,
  lastActiveAt: string | null,
  now = new Date(),
): GamificationDelta {
  const today = startOfDay(now)
  const last = lastActiveAt ? startOfDay(new Date(lastActiveAt)) : null

  let currentStreak = state.current_streak
  if (!last || last.getTime() === today.getTime()) {
    // First activity or same-day: streak unchanged.
  } else if (last.getTime() === today.getTime() - 86400000) {
    currentStreak += 1 // yesterday → streak continues
  } else {
    currentStreak = 1 // gap → streak resets
  }
  if (currentStreak === 0) currentStreak = 1

  const baseXp = XP[activity]
  const bonus = activity === 'lesson_complete' || activity === 'quiz_pass' ? XP.streak_bonus(currentStreak) : 0
  const xp = baseXp + bonus

  return {
    xp,
    current_streak: currentStreak,
    best_streak: Math.max(state.best_streak, currentStreak),
  }
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** Next tier + XP needed to reach it (for progress UI). */
export function nextTier(xp: number): { tier: CbiTier; label: string; needed: number } | null {
  if (xp >= 1200) return null
  const target: CbiTier = xp >= 500 ? 'master' : 'senior'
  const threshold = target === 'master' ? 1200 : 500
  return { tier: target, label: TIER_LABEL[target], needed: threshold - xp }
}
