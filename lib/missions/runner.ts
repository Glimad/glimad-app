import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { readAllFacts, readSignals, writeFact, appendSignal, createSnapshot } from '@/lib/brain'
import { grantPremiumCredits } from '@/lib/wallet'
import { buildPrompt, type PromptKey } from './prompts'
import { PROMPT_SCHEMAS } from './schemas'
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
    full_output_key?: string  // save entire __llm_output as this fact key
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

  // Idempotency: return any open instance for this template regardless of date
  const { data: existing } = await admin
    .from('mission_instances')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('template_code', templateCode)
    .in('status', ['queued', 'running', 'needs_user_input'])
    .order('created_at', { ascending: false })
    .limit(1)
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
  if (instance.status === 'needs_user_input') return

  const template = instance.mission_templates as { steps_json: MissionStep[]; credit_cost_allowance: number; credit_cost_premium: number }
  const steps: MissionStep[] = template.steps_json

  // Check wallet has sufficient allowance before starting
  if (template.credit_cost_allowance > 0) {
    const { data: wallet } = await admin
      .from('core_wallets')
      .select('allowance_llm_balance')
      .eq('project_id', instance.project_id)
      .single()

    if (!wallet || wallet.allowance_llm_balance < template.credit_cost_allowance) {
      await admin
        .from('mission_instances')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', instanceId)
      return
    }
  }

  // Mark as running
  await admin
    .from('mission_instances')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', instanceId)

  let brainContext: Record<string, unknown> = {}

  for (const step of steps) {
    if (step.step_number <= (instance.current_step ?? 0)) {
      // Reconstruct brainContext from previously completed steps so resumed missions have full context
      const { data: completedStep } = await admin
        .from('mission_steps')
        .select('output')
        .eq('mission_instance_id', instanceId)
        .eq('step_number', step.step_number)
        .single()

      if (completedStep?.output) {
        if (step.step_type === 'brain_read') {
          brainContext = completedStep.output as Record<string, unknown>
        }
        if (step.step_type === 'llm_text') {
          brainContext['__llm_output'] = completedStep.output
        }
        if (step.step_type === 'user_input') {
          Object.assign(brainContext, completedStep.output)
        }
      }
      continue
    }

    // Mark step as running
    await admin.from('mission_steps').upsert({
      mission_instance_id: instanceId,
      step_number: step.step_number,
      step_type: step.step_type,
      status: 'running',
      started_at: new Date().toISOString(),
    }, { onConflict: 'mission_instance_id,step_number' })

    // Before writing to Brain or assets, validate the complete LLM output
    if (step.step_type === 'brain_update' || step.step_type === 'write_outputs') {
      const llmStepDef = steps
        .slice(0, steps.findIndex(s => s.step_number === step.step_number))
        .reverse()
        .find(s => s.step_type === 'llm_text')

      if (llmStepDef?.config.prompt_key) {
        const schema = PROMPT_SCHEMAS[llmStepDef.config.prompt_key as PromptKey]
        const check = schema.safeParse(brainContext['__llm_output'])

        if (!check.success) {
          let retried: Record<string, unknown>
          try {
            retried = await callLlmStep(llmStepDef, brainContext)
          } catch (retryErr) {
            const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
            await admin.from('mission_steps').upsert({
              mission_instance_id: instanceId,
              step_number: step.step_number,
              step_type: step.step_type,
              status: 'failed',
              output: { error: `Output validation failed after retry: ${msg}` },
              completed_at: new Date().toISOString(),
            }, { onConflict: 'mission_instance_id,step_number' })
            await admin.from('mission_instances')
              .update({ status: 'failed', completed_at: new Date().toISOString() })
              .eq('id', instanceId)
            return
          }
          // Retry succeeded — update brainContext and overwrite the llm_text step row
          brainContext['__llm_output'] = retried
          await admin.from('mission_steps').upsert({
            mission_instance_id: instanceId,
            step_number: llmStepDef.step_number,
            step_type: llmStepDef.step_type,
            status: 'completed',
            output: retried,
            completed_at: new Date().toISOString(),
          }, { onConflict: 'mission_instance_id,step_number' })
        }
      }
    }

    let stepOutput: unknown
    try {
      stepOutput = await executeStep(admin, instance.project_id, instanceId, step, brainContext)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await admin.from('mission_steps').upsert({
        mission_instance_id: instanceId,
        step_number: step.step_number,
        step_type: step.step_type,
        status: 'failed',
        input: { config: step.config },
        output: { error: errorMessage },
        completed_at: new Date().toISOString(),
      }, { onConflict: 'mission_instance_id,step_number' })
      await admin.from('mission_instances')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', instanceId)
      return
    }

    if (stepOutput === 'WAIT_FOR_INPUT') {
      // Write question/choices to step row so the UI can read them directly
      await admin.from('mission_steps').upsert({
        mission_instance_id: instanceId,
        step_number: step.step_number,
        step_type: step.step_type,
        status: 'awaiting_input',
        input: { config: step.config },
        started_at: new Date().toISOString(),
      }, { onConflict: 'mission_instance_id,step_number' })
      await admin
        .from('mission_instances')
        .update({ status: 'needs_user_input', current_step: step.step_number })
        .eq('id', instanceId)
      return // stop execution until user responds
    }

    if (step.step_type === 'brain_read') {
      brainContext = stepOutput as Record<string, unknown>
    }
    if (step.step_type === 'llm_text') {
      brainContext['__llm_output'] = stepOutput
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
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      outputs: brainContext['__llm_output'] ?? {},
    })
    .eq('id', instanceId)

  // Write mission_completed signal
  await appendSignal(admin, instance.project_id, 'mission_completed', {
    template_code: instance.template_code,
    instance_id: instanceId,
  }, 'mission_runner')

  // Gamification: award XP, update streak, restore energy
  await onMissionComplete(admin, instance.project_id, instance.template_code)

  // Grant +15 premium credits per completed mission
  await grantPremiumCredits(
    admin, instance.project_id, 15,
    'MISSION_COMPLETION_REWARD',
    `mission:${instanceId}:completion_reward`
  )

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
        amount_allowance: template.credit_cost_allowance,
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

// Calls Claude for an llm_text step, validates with Zod, retries once on failure.
// Used by executeStep (normal execution) and the end-of-mission output guard.
async function callLlmStep(
  step: MissionStep,
  brainContext: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const promptKey = step.config.prompt_key as PromptKey
  const modelConfig = step.config.model ?? 'haiku'
  const model = modelConfig.startsWith('claude-')
    ? modelConfig
    : modelConfig === 'sonnet'
      ? process.env.ANTHROPIC_MODEL_SONNET!
      : process.env.ANTHROPIC_MODEL_HAIKU!
  const maxTokens = model.includes('sonnet') || model.includes('opus') ? 2048 : 1024
  const prompt = buildPrompt(promptKey, brainContext)
  const schema = PROMPT_SCHEMAS[promptKey]

  const attempt = async (): Promise<Record<string, unknown>> => {
    const message = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })
    const rawText = (message.content.find(c => c.type === 'text') as { type: 'text'; text: string } | undefined)?.text ?? ''
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    schema.parse(parsed) // throws ZodError if invalid
    return parsed as Record<string, unknown>
  }

  try {
    return await attempt()
  } catch {
    return await attempt() // one retry
  }
}

async function executeStep(
  admin: AdminClient,
  projectId: string,
  instanceId: string,
  step: MissionStep,
  brainContext: Record<string, unknown>
): Promise<unknown> {
  switch (step.step_type) {
    case 'brain_read': {
      const keys = step.config.facts ?? []
      const facts = await readAllFacts(admin, projectId)
      const result: Record<string, unknown> = {}
      for (const key of keys) result[key] = facts[key] ?? null
      if (step.config.signals_hours) {
        const signals = await readSignals(admin, projectId, step.config.signals_hours)
        result['__signals'] = signals
      }
      return result
    }

    case 'llm_text': {
      return callLlmStep(step, brainContext)
    }

    case 'user_input': {
      return 'WAIT_FOR_INPUT'
    }

    case 'brain_update': {
      const llmOutput = (brainContext['__llm_output'] ?? {}) as Record<string, unknown>

      // Save entire LLM output as a single fact (used when the output IS the fact value)
      if (step.config.full_output_key) {
        await writeFact(admin, projectId, step.config.full_output_key, llmOutput, 'mission')
      }

      // Facts that should also be synced to user_preferences columns
      const PREFERENCE_FACTS: Record<string, string> = {
        posting_frequency: 'posting_frequency',
      }
      const preferenceUpdates: Record<string, unknown> = {}

      if (step.config.facts) {
        for (const factKey of step.config.facts) {
          // Prefer user-edited value from brainContext (user_input step), fall back to LLM output
          const value = brainContext[factKey] ?? llmOutput[factKey]
          if (value !== undefined) {
            await writeFact(admin, projectId, factKey, value, 'mission')
            if (PREFERENCE_FACTS[factKey]) {
              preferenceUpdates[PREFERENCE_FACTS[factKey]] = value
            }
          }
        }
      }

      // Sync any preference facts to user_preferences
      if (Object.keys(preferenceUpdates).length > 0) {
        await admin.from('user_preferences').upsert(
          { project_id: projectId, ...preferenceUpdates, updated_at: new Date().toISOString() },
          { onConflict: 'project_id' }
        )
      }

      if (step.config.signals) {
        for (const signalKey of step.config.signals) {
          await appendSignal(admin, projectId, signalKey, { source: 'mission' }, 'mission')
        }
      }
      return { updated: true }
    }

    case 'write_outputs': {
      const llmOutput = (brainContext['__llm_output'] ?? {}) as Record<string, unknown>
      const posts = Array.isArray(llmOutput['posts'])
        ? (llmOutput['posts'] as Array<Record<string, unknown>>)
        : [llmOutput]
      const platform = (brainContext['focus_platform'] as string) ?? null
      for (const post of posts) {
        const { data: output } = await admin.from('core_outputs').insert({
          project_id: projectId,
          mission_instance_id: instanceId,
          output_type: 'content',
          format: (post['format'] as string) ?? 'post',
          content: post,
          status: 'draft',
          idempotency_key: `${instanceId}:output:${post['day'] ?? Date.now()}`,
        }).select('id').single()

        // Also create a draft calendar item so content appears in the calendar
        if (output) {
          await admin.from('core_calendar_items').insert({
            project_id: projectId,
            output_id: output.id,
            asset_id: null,
            content_type: (post['format'] as string) ?? 'post',
            platform,
            state: 'draft',
            scheduled_at: null,
          })
        }
      }
      return { saved: true, count: posts.length }
    }

    case 'snapshot': {
      const allFacts = await readAllFacts(admin, projectId)
      const currentPhase = (allFacts['current_phase'] as string) ?? 'F0'
      await createSnapshot(admin, projectId, 'mission_completed', { phase: currentPhase, facts: allFacts })
      return { snapshot_created: true }
    }

    case 'finalize': {
      // Services preference hooks (Step 20): write silent brain facts when preferences captured
      const { data: inst } = await admin
        .from('mission_instances')
        .select('template_code')
        .eq('id', instanceId)
        .single()
      if (inst?.template_code === 'PREFERENCES_CAPTURE_V1') {
        await writeFact(admin, projectId, 'services.preference.channel', 'in_app', 'system')
        await writeFact(admin, projectId, 'services.preference.mode_default', 'guided_llm', 'system')
      }
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
    .select('id, status, current_step, project_id')
    .eq('id', instanceId)
    .single()

  if (!instance || instance.status !== 'needs_user_input') return

  const currentStep = instance.current_step ?? 0

  // Save user inputs to the waiting step's output
  await admin.from('mission_steps').upsert({
    mission_instance_id: instanceId,
    step_number: currentStep,
    step_type: 'user_input',
    status: 'completed',
    output: userInputs,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'mission_instance_id,step_number' })

  // Re-queue the mission so executeMission continues from the next step
  await admin
    .from('mission_instances')
    .update({ status: 'queued' })
    .eq('id', instanceId)

  // Continue execution — this will skip completed steps (including user_input),
  // reconstruct brainContext from their DB outputs, and run remaining steps
  await executeMission(admin, instanceId)
}
