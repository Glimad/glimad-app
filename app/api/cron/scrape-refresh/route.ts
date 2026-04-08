// Periodic Scrape Refresh cron
// Runs daily. Queues FOCO scrape for projects whose data is stale:
//   BASE plan    → stale after 7 days  (weekly refresh)
//   PRO/ELITE    → stale after 24 hours (daily refresh)
// Per implementation plan Step 7.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestScrapeLight } from '@/lib/scrape'
import { readFact } from '@/lib/brain'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = Date.now()

  // Get all active projects with their subscription plan
  const { data: projects } = await admin
    .from('projects')
    .select('id, user_id, focus_platform')
    .neq('status', 'archived')

  if (!projects?.length) {
    return NextResponse.json({ queued: 0 })
  }

  // Get plan codes for all projects in one query
  const projectIds = projects.map(p => p.id)
  const { data: wallets } = await admin
    .from('core_wallets')
    .select('project_id, plan_code')
    .in('project_id', projectIds)

  const planByProject = new Map<string, string>()
  for (const w of wallets ?? []) planByProject.set(w.project_id, w.plan_code)

  // Get latest platform_metrics fetched_at per FOCO platform
  const { data: latestMetrics } = await admin
    .from('platform_metrics')
    .select('project_id, platform, handle, fetched_at')
    .in('project_id', projectIds)
    .order('fetched_at', { ascending: false })

  // Build a map: project_id → latest FOCO metrics row
  const latestByProject = new Map<string, { platform: string; handle: string; fetched_at: string }>()
  for (const m of latestMetrics ?? []) {
    if (!latestByProject.has(m.project_id)) {
      latestByProject.set(m.project_id, m)
    }
  }

  let queued = 0
  const results: Array<{ project_id: string; status: string }> = []

  for (const project of projects) {
    const planCode = planByProject.get(project.id) ?? 'BASE'
    const isProOrElite = planCode === 'PRO' || planCode === 'ELITE'

    // Staleness threshold: PRO/ELITE = 24h, BASE = 7d
    const thresholdMs = isProOrElite
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000

    const latest = latestByProject.get(project.id)
    const lastFetchedMs = latest ? new Date(latest.fetched_at).getTime() : 0
    const isStale = (now - lastFetchedMs) >= thresholdMs

    if (!isStale) {
      results.push({ project_id: project.id, status: 'fresh' })
      continue
    }

    // Determine FOCO platform and handle
    const focusPlatform = project.focus_platform ?? latest?.platform
    if (!focusPlatform) {
      results.push({ project_id: project.id, status: 'no_platform' })
      continue
    }

    // Handle: prefer from latest metrics row, fallback to brain fact
    let handle = latest?.handle ?? null
    if (!handle) {
      const focusFact = await readFact(admin, project.id, 'platforms.focus') as { handle?: string } | null
      handle = focusFact?.handle ?? null
    }

    if (!handle) {
      results.push({ project_id: project.id, status: 'no_handle' })
      continue
    }

    const result = await requestScrapeLight(admin, project.id, project.user_id, focusPlatform, handle, 'cron')
    queued++
    results.push({ project_id: project.id, status: result.status })
  }

  return NextResponse.json({ queued, total: projects.length, results })
}
