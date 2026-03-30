import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { readAllFacts, writeFact, appendSignal, createSnapshot } from '@/lib/brain'
import { buildPrompt, type PromptKey } from './prompts'
import { onMissionComplete } from '@/lib/gamification'

type AdminClient = ReturnType<typeof createAdminClient>

interface MissionStep {
  step_number: number
  step_type: string
  name: string
  config: {
    facts?: string[]
    signals_hours?: number
    prompt_key?: string
    model?: string
    fields?: string[]
    signals?: string[]
  }
  timeout_seconds: number
  retry_max: number
  skip_on_failure: boolean
  requires_credit: boolean
  credit_type: 'allowance' | 'premium' | null
  credit_amount: number
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function createMissionInstance(
  admin: AdminClient,
  projectId: string,
  templateCode: string,
  params: Record<string, unknown> = {}
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const uniqueKey = `${projectId}:${templateCode}:${today}`

  // Idempotency: return existing open instance if any
  const { data: existing } = await admin
    .from('mission_instances')
    .select('id, status')
    .eq('unique_key', uniqueKey)
    .in('status', ['queued', 'running', 'waiting_input'])
    .single()

  if (existing) return existing.id

  const { data: instance } = await admin
    .from('mission_instances')
    .insert({
      project_id: projectId,
      template_code: templateCode,
      status: 'queued',
      params,
      unique_key: uniqueKey,
      current_step: 0,
    })
    .select('id')
    .single()

  return instance!.id
}

export async function executeMission(
  admin: AdminClient,
  instanceId: string
): Promise<void> {
  const { data: instance } = await admin
    .from('mission_instances')
    .select('*, mission_templates(steps_json, credit_cost_allowance, credit_cost_premium)')
    .eq('id', instanceId)
    .single()

  if (!instance) return
  if (instance.status === 'completed' || instance.status === 'failed') return
  if (instance.status === 'waiting_input') return

  const template = instance.mission_templates as { steps_json: MissionStep[]; credit_cost_allowance: number; credit_cost_premium: number }
  const steps: MissionStep[] = template.steps_json

  // Mark as running
  await admin
    .from('mission_instances')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', instanceId)

  let brainContext: Record<string, unknown> = {}

  for (const step of steps) {
    if (step.step_number <= (instance.current_step ?? 0)) continue

    // Mark step as running
    await admin.from('mission_steps').upsert({
      mission_instance_id: instanceId,
      step_number: step.step_number,
      step_type: step.step_type,
      status: 'running',
      started_at: new Date().toISOString(),
    }, { onConflict: 'mission_instance_id,step_number' })

    const stepOutput = await executeStep(admin, instance.project_id, step, brainContext)

    if (stepOutput === 'WAIT_FOR_INPUT') {
      await admin
        .from('mission_instances')
        .update({ status: 'waiting_input', current_step: step.step_number })
        .eq('id', instanceId)
      return // pause execution
    }

    if (step.step_type === 'brain_read') {
      brainContext = stepOutput as Record<string, unknown>
    }

    await admin.from('mission_steps').upsert({
      mission_instance_id: instanceId,
      step_number: step.step_number,
      step_type: step.step_type,
      status: 'completed',
      input: { config: step.config },
      output: typeof stepOutput === 'object' ? stepOutput : { result: stepOutput },
      completed_at: new Date().toISOString(),
    }, { onConflict: 'mission_instance_id,step_number' })

    await admin
      .from('mission_instances')
      .update({ current_step: step.step_number })
      .eq('id', instanceId)
  }

  // All steps done
  await admin
    .from('mission_instances')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', instanceId)

  // Write mission_completed signal
  await appendSignal(admin, instance.project_id, 'mission_completed', {
    template_code: instance.template_code,
    instance_id: instanceId,
  }, 'mission_runner')

  // Gamification: award XP, update streak, restore energy
  await onMissionComplete(admin, instance.project_id, instance.template_code)

  // Debit allowance credits
  if (template.credit_cost_allowance > 0) {
    const { data: wallet } = await admin
      .from('core_wallets')
      .select('wallet_id, allowance_llm_balance')
      .eq('project_id', instance.project_id)
      .single()

    if (wallet && wallet.allowance_llm_balance >= template.credit_cost_allowance) {
      const newBalance = wallet.allowance_llm_balance - template.credit_cost_allowance
      await admin.from('core_ledger').insert({
        project_id: instance.project_id,
        kind: 'debit',
        amount_allowance: -template.credit_cost_allowance,
        reason_key: 'MISSION_ALLOWANCE_DEBIT',
        idempotency_key: `mission:${instanceId}:allowance_debit`,
        metadata_json: { template_code: instance.template_code },
      })
      await admin
        .from('core_wallets')
        .update({ allowance_llm_balance: newBalance, updated_at: new Date().toISOString() })
        .eq('wallet_id', wallet.wallet_id)
    }
  }
}

async function executeStep(
  admin: AdminClient,
  projectId: string,
  step: MissionStep,
  brainContext: Record<string, unknown>
): Promise<unknown> {
  switch (step.step_type) {
    case 'brain_read': {
      const keys = step.config.facts ?? []
      const facts = await readAllFacts(admin, projectId)
      const result: Record<string, unknown> = {}
      for (const key of keys) result[key] = facts[key] ?? null
      // Also include all facts for broad context
      return { ...facts, ...result }
    }

    case 'llm_text': {
      const promptKey = step.config.prompt_key as PromptKey
      const model = step.config.model === 'sonnet'
        ? process.env.ANTHROPIC_MODEL_SONNET!
        : process.env.ANTHROPIC_MODEL_HAIKU!

      const prompt = buildPrompt(promptKey, brainContext)

      const message = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const textContent = message.content.find(c => c.type === 'text')
      const rawText = textContent?.text ?? ''

      // Extract JSON from response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return { raw: rawText }
    }

    case 'user_input': {
      return 'WAIT_FOR_INPUT'
    }

    case 'brain_update': {
      const completedLlmStep = brainContext['__llm_output'] as Record<string, unknown> | null

      // Find the most recent LLM output from the instance
      if (step.config.facts) {
        for (const factKey of step.config.facts) {
          // The user-approved output comes from the waiting_input step outputs
          const userOutput = brainContext[factKey] ?? completedLlmStep?.[factKey]
          if (userOutput !== undefined) {
            await writeFact(admin, projectId, factKey, userOutput, 'mission')
          }
        }
      }

      if (step.config.signals) {
        for (const signalKey of step.config.signals) {
          await appendSignal(admin, projectId, signalKey, { source: 'mission' }, 'mission')
        }
      }
      return { updated: true }
    }

    case 'write_outputs': {
      // Save content to core_outputs
      return { saved: true }
    }

    case 'snapshot': {
      const allFacts = await readAllFacts(admin, projectId)
      const currentPhase = (allFacts['current_phase'] as string) ?? 'F0'
      await createSnapshot(admin, projectId, 'mission_completed', currentPhase, allFacts)
      return { snapshot_created: true }
    }

    case 'finalize': {
      return { finalized: true }
    }

    default:
      return { skipped: true, step_type: step.step_type }
  }
}

export async function resumeMissionAfterInput(
  admin: AdminClient,
  instanceId: string,
  userInputs: Record<string, unknown>
): Promise<void> {
  const { data: instance } = await admin
    .from('mission_instances')
    .select('*, mission_templates(steps_json)')
    .eq('id', instanceId)
    .single()

  if (!instance || instance.status !== 'waiting_input') return

  const template = instance.mission_templates as { steps_json: MissionStep[] }
  const steps: MissionStep[] = template.steps_json
  const currentStep = instance.current_step ?? 0

  // Save user input to step
  await admin.from('mission_steps').upsert({
    mission_instance_id: instanceId,
    step_number: currentStep,
    step_type: 'user_input',
    status: 'completed',
    output: userInputs,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'mission_instance_id,step_number' })

  // Get the LLM output from the previous step
  const { data: llmStep } = await admin
    .from('mission_steps')
    .select('output')
    .eq('mission_instance_id', instanceId)
    .eq('step_type', 'llm_text')
    .order('step_number', { ascending: false })
    .limit(1)
    .single()

  const llmOutput = (llmStep?.output ?? {}) as Record<string, unknown>

  // Apply brain update for all facts from user inputs + llm output
  const mergedOutput = { ...llmOutput, ...userInputs }

  // Find brain_update step and apply it
  const brainUpdateStep = steps.find(s => s.step_type === 'brain_update' && s.step_number > currentStep)
  if (brainUpdateStep?.config.facts) {
    for (const factKey of brainUpdateStep.config.facts) {
      const value = mergedOutput[factKey]
      if (value !== undefined) {
        await writeFact(admin, instance.project_id, factKey, value, 'mission')
      }
    }
    if (brainUpdateStep.config.signals) {
      for (const signalKey of brainUpdateStep.config.signals) {
        await appendSignal(admin, instance.project_id, signalKey, { source: 'mission' }, 'mission')
      }
    }
    await admin.from('mission_steps').upsert({
      mission_instance_id: instanceId,
      step_number: brainUpdateStep.step_number,
      step_type: 'brain_update',
      status: 'completed',
      output: { updated: true },
      completed_at: new Date().toISOString(),
    }, { onConflict: 'mission_instance_id,step_number' })
  }

  // Mark mission complete
  await admin
    .from('mission_instances')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      outputs: mergedOutput,
    })
    .eq('id', instanceId)

  // Write mission_completed signal
  await appendSignal(admin, instance.project_id, 'mission_completed', {
    template_code: instance.template_code,
    instance_id: instanceId,
  }, 'mission_runner')

  // Gamification: award XP, update streak, restore energy
  await onMissionComplete(admin, instance.project_id, instance.template_code)
}
