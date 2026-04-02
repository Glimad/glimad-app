// POST /api/monetization/suggest — generate AI product suggestion
// Requires: project is F3+ and in monetize/scale mode (enforced here)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateProductSuggestion } from '@/lib/monetization'
import { getProjectId } from '@/lib/supabase/project'

export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const projectId = await getProjectId(req, admin)

  const { data: project } = await admin
    .from('projects')
    .select('phase_code')
    .eq('id', projectId)
    .single()

  const phaseRank: Record<string, number> = { F0: 0, F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7 }
  if (!project || (phaseRank[project.phase_code ?? 'F0'] ?? 0) < 3) {
    return NextResponse.json({ error: 'requires_f3_plus' }, { status: 403 })
  }

  const suggestion = await generateProductSuggestion(admin, projectId)
  return NextResponse.json({ suggestion })
}
