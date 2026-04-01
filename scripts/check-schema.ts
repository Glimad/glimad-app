import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  // Check existing types
  const { data } = await admin.from('mission_templates').select('template_code, type').limit(10)
  console.log('Existing types:')
  data?.forEach(t => console.log(' ', t.template_code, '->', t.type))
}
main()
