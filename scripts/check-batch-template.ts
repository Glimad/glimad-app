import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data } = await admin.from('mission_templates').select('template_code, steps_json, credit_cost_allowance, phase_min').eq('template_code', 'CONTENT_BATCH_3D_V1').single()
  console.log(JSON.stringify(data, null, 2))
}
main()
