import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data, error } = await admin.from('core_ledger').select('*').limit(1)
  if (data && data[0]) {
    console.log('core_ledger columns:', Object.keys(data[0]).join(', '))
  } else {
    // Try to get schema from empty table
    const { data: d2 } = await admin.rpc('exec_sql', { sql: "SELECT column_name FROM information_schema.columns WHERE table_name = 'core_ledger' AND table_schema = 'public'" })
    console.log('Columns via RPC:', JSON.stringify(d2))
    console.log('Error:', error?.message)
  }
}
main()
