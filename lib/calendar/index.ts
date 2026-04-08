// Calendar — business logic for calendar item state transitions and writes
// API routes call these functions; no HTTP concerns here.

import { createAdminClient } from '@/lib/supabase/admin'
import { appendSignal } from '@/lib/brain'

type AdminClient = ReturnType<typeof createAdminClient>

// Valid status transitions (state machine)
// draft → scheduled → publishing → published | failed (spec Step 13)
export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:      ['scheduled'],
  scheduled:  ['publishing', 'published', 'paused', 'failed'],
  publishing: ['published', 'failed'],
  failed:     ['scheduled'],
  paused:     ['scheduled'],
  published:  [],
}

export function isValidTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

// Update a calendar item (status transition + field updates).
// Returns null if the item doesn't exist or doesn't belong to the project.
export async function updateCalendarItem(
  admin: AdminClient,
  projectId: string,
  itemId: string,
  newStatus: string | undefined,
  fields: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const updates: Record<string, unknown> = { ...fields }
  if (newStatus) updates.status = newStatus

  const { data: item } = await admin
    .from('core_calendar_items')
    .update(updates)
    .eq('id', itemId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (!item) return null

  if (newStatus === 'published') {
    const publishedAt = new Date().toISOString()

    // Mark actual published_at timestamp
    await admin
      .from('core_calendar_items')
      .update({ published_at: publishedAt })
      .eq('id', itemId)

    await appendSignal(admin, projectId, 'content_published', {
      calendar_item_id: itemId,
      platform: item.platform,
      date: publishedAt,
    }, 'calendar')

    // Write to event_log (per spec §5.3 and Step 13)
    await admin.from('event_log').insert({
      project_id: projectId,
      event_type: 'content_published',
      event_data: {
        calendar_item_id: itemId,
        platform: item.platform,
        content_type: item.content_type,
        published_at: publishedAt,
      },
    })

    // Energy +5 on content publish (per spec Step 16)
    const { data: project } = await admin
      .from('projects')
      .select('user_id, energy')
      .eq('id', projectId)
      .single()

    if (project) {
      await admin
        .from('projects')
        .update({ energy: Math.min(100, (project.energy ?? 0) + 5) })
        .eq('id', projectId)
    }
  }

  return item
}

export async function deleteCalendarItem(
  admin: AdminClient,
  projectId: string,
  itemId: string
): Promise<void> {
  await admin
    .from('core_calendar_items')
    .delete()
    .eq('id', itemId)
    .eq('project_id', projectId)
}
