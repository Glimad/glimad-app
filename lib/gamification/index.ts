import type { SupabaseClient } from '@supabase/supabase-js'
import { writeFact, readAllFacts } from '@/lib/brain'

const XP_PER_LEVEL = 500

export function getLevel(xp: number): { level: number; xpInLevel: number; xpForNext: number } {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1
  const xpInLevel = xp % XP_PER_LEVEL
  return { level, xpInLevel, xpForNext: XP_PER_LEVEL }
}

export async function getGamificationState(admin: SupabaseClient, projectId: string) {
  const { data: project } = await admin
    .from('projects')
    .select('xp, energy, streak_days')
    .eq('id', projectId)
    .single()

  if (!project) return null

  const { level, xpInLevel, xpForNext } = getLevel(project.xp)
  return {
    xp: project.xp,
    level,
    xpInLevel,
    xpForNext,
    energy: project.energy,
    streak: project.streak_days,
  }
}

export async function onMissionStart(admin: SupabaseClient, projectId: string): Promise<void> {
  const { data: project } = await admin
    .from('projects')
    .select('energy')
    .eq('id', projectId)
    .single()

  if (!project || project.energy <= 0) return

  await admin
    .from('projects')
    .update({ energy: Math.max(0, project.energy - 5) })
    .eq('id', projectId)
}

export async function onMissionComplete(
  admin: SupabaseClient,
  projectId: string,
  templateCode: string
): Promise<{ xpAwarded: number; newStreak: number }> {
  const { data: template } = await admin
    .from('mission_templates')
    .select('xp_reward')
    .eq('template_code', templateCode)
    .single()

  const xpReward = template?.xp_reward ?? 50

  const { data: project } = await admin
    .from('projects')
    .select('xp, energy, streak_days')
    .eq('id', projectId)
    .single()

  if (!project) return { xpAwarded: 0, newStreak: 0 }

  const facts = await readAllFacts(admin, projectId)
  const lastMissionDate = facts['last_mission_date'] as string | null
  const today = new Date().toISOString().slice(0, 10)

  let newStreak = project.streak_days

  if (!lastMissionDate) {
    newStreak = 1
  } else {
    const diffMs = new Date(today).getTime() - new Date(lastMissionDate).getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      // same day — keep streak
    } else if (diffDays === 1) {
      newStreak = project.streak_days + 1
    } else {
      const freezesAvailable = (facts['streak_freezes_available'] as number) ?? 0
      if (freezesAvailable > 0 && diffDays <= 2) {
        await writeFact(admin, projectId, 'streak_freezes_available', freezesAvailable - 1, 'gamification')
        newStreak = project.streak_days + 1
      } else {
        newStreak = 1
      }
    }
  }

  await writeFact(admin, projectId, 'last_mission_date', today, 'gamification')

  await admin
    .from('projects')
    .update({
      xp: project.xp + xpReward,
      energy: Math.min(100, project.energy + 5),
      streak_days: newStreak,
    })
    .eq('id', projectId)

  await checkStreakMilestones(admin, projectId, newStreak)

  return { xpAwarded: xpReward, newStreak }
}

const STREAK_MILESTONES: Record<number, { energy: number; credits: number }> = {
  3:  { energy: 20, credits: 0  },
  7:  { energy: 0,  credits: 50 },
  14: { energy: 0,  credits: 100 },
  30: { energy: 0,  credits: 0  }, // VIP badge — cosmetic only
}

async function checkStreakMilestones(admin: SupabaseClient, projectId: string, streak: number): Promise<void> {
  const facts = await readAllFacts(admin, projectId)
  const granted = (facts['streak_milestones_granted'] as number[]) ?? []

  for (const [milestoneStr, reward] of Object.entries(STREAK_MILESTONES)) {
    const milestone = Number(milestoneStr)
    if (streak >= milestone && !granted.includes(milestone)) {
      if (reward.energy > 0) {
        const { data: p } = await admin.from('projects').select('energy').eq('id', projectId).single()
        if (p) {
          await admin.from('projects').update({ energy: Math.min(100, p.energy + reward.energy) }).eq('id', projectId)
        }
      }
      if (reward.credits > 0) {
        const { data: wallet } = await admin
          .from('core_wallets')
          .select('wallet_id, premium_credits_balance')
          .eq('project_id', projectId)
          .single()
        if (wallet) {
          await admin.from('core_wallets')
            .update({ premium_credits_balance: wallet.premium_credits_balance + reward.credits })
            .eq('wallet_id', wallet.wallet_id)
          await admin.from('core_ledger').insert({
            project_id: projectId,
            kind: 'credit',
            amount_premium: reward.credits,
            reason_key: 'STREAK_BONUS',
            idempotency_key: `streak_bonus_${projectId}_${milestone}`,
            metadata_json: { streak_milestone: milestone },
          })
        }
      }
      // 30-day milestone: VIP badge (cosmetic)
      if (milestone === 30) {
        await writeFact(admin, projectId, 'vip_badge', true, 'gamification')
      }
      granted.push(milestone)
      await writeFact(admin, projectId, 'streak_milestones_granted', granted, 'gamification')
    }
  }
}

export async function initStreakFreezes(admin: SupabaseClient, projectId: string): Promise<void> {
  const facts = await readAllFacts(admin, projectId)
  if (facts['streak_freezes_available'] === undefined) {
    await writeFact(admin, projectId, 'streak_freezes_available', 2, 'gamification')
  }
}

export async function resetMonthlyStreakFreezes(admin: SupabaseClient, projectId: string): Promise<void> {
  await writeFact(admin, projectId, 'streak_freezes_available', 2, 'gamification')
}
