import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data: proj } = await admin.from('projects').select('id').limit(1).single()
  if (!proj) return console.log('No projects')

  // Insert a core_output
  const { data: output, error: outErr } = await admin.from('core_outputs').insert({
    project_id: proj.id,
    output_type: 'content',
    format: 'post',
    content: { hook: 'test hook' },
    status: 'draft',
  }).select('id').single()
  if (outErr) return console.log('core_outputs insert error:', outErr.message)
  console.log('Created output:', output!.id)

  // Insert core_calendar_item with output_id
  const { data: ci, error: ciErr } = await admin.from('core_calendar_items').insert({
    project_id: proj.id,
    output_id: output!.id,
    content_type: 'post',
    state: 'draft',
  }).select('id').single()
  if (ciErr) {
    console.log('core_calendar_items insert error:', ciErr.message)
  } else {
    console.log('Created calendar item:', ci!.id, '(output_id FK works)')
    await admin.from('core_calendar_items').delete().eq('id', ci!.id)
  }
  await admin.from('core_outputs').delete().eq('id', output!.id)
}
main()
