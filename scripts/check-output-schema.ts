import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // Check core_outputs columns
  const { data: outputs } = await admin.from('core_outputs').select('*').limit(1)
  if (outputs && outputs[0]) {
    console.log('core_outputs columns:', Object.keys(outputs[0]).join(', '))
  } else {
    const { data: proj } = await admin.from('projects').select('id').limit(1).single()
    if (!proj) return
    const { data: o, error } = await admin.from('core_outputs').insert({
      project_id: proj.id,
      output_type: 'content',
      format: 'post',
      content: {},
      status: 'draft',
    }).select().single()
    if (o) {
      console.log('core_outputs columns:', Object.keys(o).join(', '))
      await admin.from('core_outputs').delete().eq('id', o.id)
    } else {
      console.log('Error:', error?.message)
    }
  }
}
main()
