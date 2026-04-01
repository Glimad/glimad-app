import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // Get schema via information_schema
  const { data } = await admin
    .from('core_calendar_items')
    .select('*')
    .limit(1)

  if (data && data[0]) {
    console.log('core_calendar_items columns:', Object.keys(data[0]).join(', '))
    return
  }

  // Use an existing project
  const { data: proj } = await admin.from('projects').select('id').limit(1).single()
  if (!proj) { console.log('No projects found'); return }

  const { data: ci, error } = await admin.from('core_calendar_items').insert({
    project_id: proj.id,
    content_type: 'post',
    state: 'draft',
  }).select().single()

  if (ci) {
    console.log('Columns:', Object.keys(ci).join(', '))
    await admin.from('core_calendar_items').delete().eq('id', ci.id)
  } else {
    console.log('Error:', error?.message)
  }
}
main()
