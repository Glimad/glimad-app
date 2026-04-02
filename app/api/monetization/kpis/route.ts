// GET /api/monetization/kpis — dashboard KPIs for Monetization Center

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonetizationKpis } from '@/lib/monetization'
import { getProjectId } from '@/lib/supabase/project'

export async function GET(req: NextRequest) {
  const admin = createAdminClient()
  const projectId = await getProjectId(req, admin)
  const kpis = await getMonetizationKpis(admin, projectId)
  return NextResponse.json({ kpis })
}
