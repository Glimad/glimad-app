/* eslint-disable */
// Applies supabase/migrations/fix_mission_status.sql against the live DB and
// heals mission instances that got stuck in 'running' because their
// 'waiting_input' transition was rejected by the old constraint.
//
// Uses DATABASE_URL (direct Postgres) rather than supabase-js because the
// constraint change is DDL.
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')

  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await pg.connect()

  console.log('Applying migration fix_mission_status.sql…')
  // Must migrate existing rows BEFORE re-adding the stricter constraint
  await pg.query('ALTER TABLE mission_instances DROP CONSTRAINT IF EXISTS mission_instances_status_check')
  const r1 = await pg.query(`UPDATE mission_instances SET status = 'waiting_input' WHERE status = 'needs_user_input'`)
  console.log(`  ✓ migrated ${r1.rowCount} rows: needs_user_input → waiting_input`)
  await pg.query(`ALTER TABLE mission_instances ADD CONSTRAINT mission_instances_status_check
                  CHECK (status IN ('queued','running','waiting_input','completed','failed','cancelled'))`)
  console.log('  ✓ constraint rebuilt')

  await pg.end()

  // Heal the 'running' instances that actually have an awaiting_input step
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  ) as any

  const { data: running } = await admin.from('mission_instances').select('id').eq('status', 'running')
  let healed = 0
  for (const m of running ?? []) {
    const { data: steps } = await admin.from('mission_steps')
      .select('step_number, status')
      .eq('mission_instance_id', m.id)
      .eq('status', 'awaiting_input')
    if (steps && steps.length > 0) {
      const stepNo = steps[0].step_number
      const { error } = await admin.from('mission_instances')
        .update({ status: 'waiting_input', current_step: stepNo })
        .eq('id', m.id)
      if (!error) healed++
      else console.log(`  ! could not heal ${m.id}: ${error.message}`)
    }
  }
  console.log(`  ✓ healed ${healed} stuck 'running' missions → waiting_input`)
}

main().catch(e => { console.error(e); process.exit(1) })
