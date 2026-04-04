// Helper: resolve project_id from authenticated request
// Throws if user not authenticated or project not found.

import { getAuthUser } from '@/lib/supabase/extract-token'

import { createAdminClient } from '@/lib/supabase/admin'
type AdminClient = ReturnType<typeof createAdminClient>

export async function getProjectId(req: Request, admin: AdminClient): Promise<string> {
  const user = await getAuthUser(req)
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 })

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 })
  return project.id
}
