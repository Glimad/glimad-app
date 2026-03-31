// Worker route — picks up queued scrape jobs and executes them
// Called by Vercel Cron or manually by admin
// Protected by CRON_SECRET header
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeScrapeLightJob } from '@/lib/scrape'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Pick up to 5 queued scrape_light jobs (oldest first)
  const { data: jobs } = await admin
    .from('core_jobs')
    .select('job_id')
    .eq('job_type', 'scrape_light')
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(5)

  if (!jobs?.length) {
    return NextResponse.json({ processed: 0 })
  }

  const results: Array<{ job_id: string; result: string }> = []

  for (const job of jobs) {
    // Atomically claim the job — skip if another invocation already grabbed it
    const { data: claimed } = await admin
      .from('core_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('job_id', job.job_id)
      .eq('status', 'queued')
      .select('job_id, attempts, max_attempts')
      .single()

    if (!claimed) continue // Claimed by a concurrent invocation — skip

    const outcome = await executeScrapeLightJob(admin, job.job_id)
      .then(() => 'done')
      .catch(async (err: Error) => {
        const currentAttempts = claimed.attempts + 1 // attempts was incremented inside executeScrapeLightJob
        const isFinal = currentAttempts >= (claimed.max_attempts ?? 3)

        await admin
          .from('core_jobs')
          .update({
            status: isFinal ? 'failed' : 'queued',
            finished_at: isFinal ? new Date().toISOString() : null,
            error_text: err.message,
          })
          .eq('job_id', job.job_id)

        return `failed: ${err.message}`
      })
    results.push({ job_id: job.job_id, result: outcome })
  }

  return NextResponse.json({ processed: results.length, results })
}
