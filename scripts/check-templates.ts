import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const { data } = await admin
    .from('mission_templates')
    .select('template_code, active, phase_min, phase_max, priority_class')
    .order('priority_class')
  console.log('All templates:', data?.length)
  const active = data?.filter(t => t.active)
  console.log('Active:', active?.length)
  active?.forEach(t => console.log(' ', t.priority_class, t.template_code, `${t.phase_min}->${t.phase_max}`))
}
main()
