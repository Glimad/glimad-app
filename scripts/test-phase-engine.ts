// E2E test for Step 8 — Phase Engine
// Run: npx tsx --env-file=.env scripts/test-phase-engine.ts
import { createClient } from '@supabase/supabase-js'
import { computePhase, runPhaseEngine } from '../lib/engines/phase-engine'
import { writeFact, appendSignal, readFact } from '../lib/brain'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

let passed = 0
let failed = 0

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${label}`); passed++ }
  else { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++ }
}

async function seedProject(db: ReturnType<typeof admin>) {
  const { data: existing } = await db.from('projects').select('user_id').limit(1).single()
  if (!existing) throw new Error('No existing user found in DB')

  const { data: proj, error } = await db.from('projects').insert({
    user_id: existing.user_id,
    name: 'Phase Engine E2E Test',
    status: 'archived',
    phase_code: 'F0',
    active_mode: 'test',
    publishing_mode: 'BUILDING',
    focus_platform: 'instagram',
    focus_platform_handle: 'testuser',
  }).select('id').single()

  if (error) throw new Error(`Project seed failed: ${error.message}`)
  return proj!.id
}

async function cleanup(db: ReturnType<typeof admin>, projectId: string) {
  await db.from('brain_facts').delete().eq('project_id', projectId)
  await db.from('brain_signals').delete().eq('project_id', projectId)
  await db.from('brain_snapshots').delete().eq('project_id', projectId)
  await db.from('core_phase_runs').delete().eq('project_id', projectId)
  await db.from('projects_platforms').delete().eq('project_id', projectId)
  await db.from('projects').delete().eq('id', projectId)
}

// ── TEST 1: empty Brain → F0 ──────────────────────────────────────────────────

async function testEmptyBrainIsF0(db: ReturnType<typeof admin>, projectId: string) {
  console.log('\n[1] Empty Brain → F0 + evidence gate')
  const result = await computePhase(db as any, projectId)

  ok('returns PhaseResult', !!result)
  ok('phase is F0 (no data)', result.phase === 'F0', `got ${result.phase}`)
  ok('capabilityScore 0-15', result.capabilityScore >= 0 && result.capabilityScore <= 15,
    `got ${result.capabilityScore}`)
  ok('evidence gate: has_evidence=false', result.gates['has_evidence'] === false)
  ok('technology: handle absent = 0', result.dimensionScores.technology === 0)
  ok('discovery: no niche = 0', result.dimensionScores.discovery === 0)
  ok('confidence < 0.8', result.confidence < 0.8)
  ok('reasonSummary non-empty', result.reasonSummary.length > 0)
}

// ── TEST 2: niche + handle + scrape → technology and discovery scores ─────────

async function testNicheAndScrape(db: ReturnType<typeof admin>, projectId: string) {
  console.log('\n[2] Niche + handle + scrape signal → dimensions score up')

  await writeFact(db as any, projectId, 'niche_raw', 'electronic pop music', 'test')
  await writeFact(db as any, projectId, 'primary_goal', 'reach 10K followers', 'test')
  await writeFact(db as any, projectId, 'focus_platform_handle', 'testuser', 'test')
  await writeFact(db as any, projectId, 'avg_engagement_rate', 0.03, 'test')
  await writeFact(db as any, projectId, 'posts_last_30d', 12, 'test')
  await writeFact(db as any, projectId, 'followers_total', 1200, 'test')

  // Scrape signal
  await appendSignal(db as any, projectId, 'scrape_completed', { platform: 'instagram', followers: 1200 }, 'test')
  await appendSignal(db as any, projectId, 'growth.followers_total', { value: 1200, platform: 'instagram' }, 'test')
  await appendSignal(db as any, projectId, 'engagement.avg_er_7d', { value: 0.03, platform: 'instagram' }, 'test')

  const result = await computePhase(db as any, projectId)

  ok('technology > 0 (handle + scrape)', result.dimensionScores.technology > 0,
    `got ${result.dimensionScores.technology}`)
  ok('technology has handle (30pts)', result.dimensionScores.technology >= 30)
  ok('technology has scrape (40pts)', result.dimensionScores.technology >= 70,
    `got ${result.dimensionScores.technology}`)
  ok('discovery > 0 (niche defined)', result.dimensionScores.discovery > 0,
    `got ${result.dimensionScores.discovery}`)
  ok('audience > 0 (ER=3%)', result.dimensionScores.audience > 0,
    `got ${result.dimensionScores.audience}`)
  ok('consistency > 0 (12 posts/30d = 3/wk)', result.dimensionScores.consistency >= 70,
    `got ${result.dimensionScores.consistency}`)
}

// ── TEST 3: evidence gate — < 3 signals caps at F1 ───────────────────────────

async function testEvidenceGate(db: ReturnType<typeof admin>, projectId: string) {
  console.log('\n[3] Evidence gate — < 3 signals caps phase at F1')

  // We have exactly 3 signals from test 2 (scrape_completed, growth, engagement)
  // Remove them and add only 2
  await db.from('brain_signals').delete().eq('project_id', projectId)
  await appendSignal(db as any, projectId, 'scrape_completed', { platform: 'instagram' }, 'test')
  await appendSignal(db as any, projectId, 'growth.followers_total', { value: 1200 }, 'test')
  // Only 2 signals — should cap at F1

  const result = await computePhase(db as any, projectId)
  const phaseRank = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']
  ok('evidence gate applied: phase ≤ F1', phaseRank.indexOf(result.phase) <= 1,
    `got ${result.phase}`)
  ok('gates.has_evidence = false', result.gates['has_evidence'] === false)
}

// ── TEST 4: 3+ signals — evidence gate lifts ──────────────────────────────────

async function testEvidenceLift(db: ReturnType<typeof admin>, projectId: string) {
  console.log('\n[4] 3+ signals → evidence gate lifts, phase can advance')

  await appendSignal(db as any, projectId, 'consistency.posts_published_7d', { value: 3 }, 'test')
  // Now 3 signals total

  const result = await computePhase(db as any, projectId)
  ok('gates.has_evidence = true', result.gates['has_evidence'] === true)
  // With niche + handle + scrape + ER + posts, should be at least F1
  ok('phase ≥ F1', ['F1','F2','F3','F4','F5','F6','F7'].includes(result.phase),
    `got ${result.phase}`)
}

// ── TEST 5: F4 blocked without offer ─────────────────────────────────────────

async function testF4Gate(db: ReturnType<typeof admin>, projectId: string) {
  console.log('\n[5] F4 hard gate — blocked without offer_defined')

  // Set high-scoring facts to push score toward F4 range (45-60)
  await writeFact(db as any, projectId, 'avg_engagement_rate', 0.05, 'test')
  await writeFact(db as any, projectId, 'followers_total', 6000, 'test')
  await writeFact(db as any, projectId, 'posts_last_30d', 20, 'test')
  await writeFact(db as any, projectId, 'audience_persona', { age: '18-30' }, 'test')

  // Add more signals for evidence
  for (let i = 0; i < 5; i++) {
    await appendSignal(db as any, projectId, 'engagement.avg_er_7d', { value: 0.05 }, 'test')
    await appendSignal(db as any, projectId, 'growth.followers_total', { value: 6000 + i * 100 }, 'test')
  }

  const resultNoOffer = await computePhase(db as any, projectId)
  // If computed phase would be F4, gate should block it
  if (resultNoOffer.gates['f4_blocked_no_offer']) {
    ok('F4 gate blocked (no offer)', resultNoOffer.phase === 'F3',
      `got ${resultNoOffer.phase}`)
    ok('gate flag set', resultNoOffer.gates['f4_blocked_no_offer'] === true)
  } else {
    console.log(`  ~ score ${resultNoOffer.capabilityScore} didn't reach F4 range — gate not triggered`)
  }

  // Now add offer_title — gate should clear
  await writeFact(db as any, projectId, 'offer_title', 'My Offer', 'test')
  const resultWithOffer = await computePhase(db as any, projectId)
  ok('offer_defined present in gates', resultWithOffer.gates['offer_defined'] === true)
  ok('F4 gate not blocking (offer set)', !resultWithOffer.gates['f4_blocked_no_offer'])
}

// ── TEST 6: runPhaseEngine — persists run + writes facts ──────────────────────

async function testRunPhaseEngine(db: ReturnType<typeof admin>, projectId: string) {
  console.log('\n[6] runPhaseEngine — persists run, writes facts, updates project')

  const result = await runPhaseEngine(db as any, projectId)

  ok('returns PhaseResult', !!result.phase)

  // core_phase_runs row
  const { data: run } = await db.from('core_phase_runs')
    .select('*').eq('project_id', projectId)
    .order('computed_at', { ascending: false }).limit(1).single()
  ok('core_phase_runs row created', !!run)
  ok('phase_code matches result', run?.phase_code === result.phase)
  ok('capability_score matches', run?.capability_score === result.capabilityScore)
  ok('dimension_scores present', !!run?.dimension_scores)
  ok('confidence present', typeof run?.confidence === 'number')
  ok('reason_summary present', !!run?.reason_summary)

  // Brain facts
  const currentPhase = await readFact(db as any, projectId, 'current_phase')
  ok('current_phase fact written', currentPhase === result.phase, `got ${currentPhase}`)

  const phaseScores = await readFact(db as any, projectId, 'phase_scores')
  ok('phase_scores fact written', !!phaseScores)

  const capScore = await readFact(db as any, projectId, 'capability_score')
  ok('capability_score fact written', capScore === result.capabilityScore, `got ${capScore}`)

  // Project updated
  const { data: project } = await db.from('projects').select('phase_code').eq('id', projectId).single()
  ok('projects.phase_code updated', project?.phase_code === result.phase, `got ${project?.phase_code}`)
}

// ── TEST 7: satellite platforms → technology score +30 ───────────────────────

async function testSatellites(db: ReturnType<typeof admin>, projectId: string) {
  console.log('\n[7] Satellite platforms → technology +30')

  const resultBefore = await computePhase(db as any, projectId)

  await db.from('projects_platforms').insert({
    project_id: projectId,
    platform: 'tiktok',
    handle: 'testuser',
    role: 'satellite',
    connected: false,
  })

  const resultAfter = await computePhase(db as any, projectId)
  ok('technology increased by 30 with satellite', resultAfter.dimensionScores.technology === resultBefore.dimensionScores.technology + 30,
    `before=${resultBefore.dimensionScores.technology}, after=${resultAfter.dimensionScores.technology}`)
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase Engine E2E Test ===\n')
  const db = admin()
  const projectId = await seedProject(db)
  console.log(`Test project: ${projectId}`)

  try {
    await testEmptyBrainIsF0(db, projectId)
    await testNicheAndScrape(db, projectId)
    await testEvidenceGate(db, projectId)
    await testEvidenceLift(db, projectId)
    await testF4Gate(db, projectId)
    await testRunPhaseEngine(db, projectId)
    await testSatellites(db, projectId)
  } catch (err) {
    console.error('\nFATAL:', (err as Error).message)
    failed++
  } finally {
    console.log('\nCleaning up...')
    await cleanup(db, projectId)
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()
