import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data } = await admin.from('mission_templates').select('template_code, steps_json').eq('active', true)
  data?.forEach((t: { template_code: string; steps_json: Array<{ step_type: string; config: { model?: string } }> }) => {
    const llmStep = t.steps_json?.find(s => s.step_type === 'llm_text')
    if (llmStep) console.log(t.template_code, '→', llmStep.config.model)
  })
}
main()
