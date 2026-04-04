// Notifications — send and track notifications
// Three types: mission_reminder, publish_success/failed, weekly_digest

import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

type AdminClient = ReturnType<typeof createAdminClient>

const resend = new Resend(process.env.RESEND_API_KEY!)
const FROM_EMAIL = process.env.EMAIL_FROM!

// ── Email copy (bilingual) ────────────────────────────────────────────────

const COPY = {
  en: {
    mission_reminder: {
      subject: '[Glimad] Your mission needs your input',
      heading: 'Your mission is waiting',
      body: (template: string) => `The mission <strong>${template}</strong> is waiting for your input for more than 24 hours.`,
      sub: 'Complete it to keep your growth momentum going.',
      cta: 'Continue Mission →',
    },
    weekly_digest: {
      subject: '[Glimad] Your weekly growth summary',
      heading: 'Your week in Glimad',
      phase_label: 'Phase',
      missions_label: 'Missions completed',
      content_label: 'Content published',
      followers_label: 'Follower change',
      cta: 'View Dashboard →',
    },
  },
  es: {
    mission_reminder: {
      subject: '[Glimad] Tu misión necesita tu respuesta',
      heading: 'Tu misión está esperando',
      body: (template: string) => `La misión <strong>${template}</strong> lleva más de 24 horas esperando tu respuesta.`,
      sub: 'Complétala para mantener tu impulso de crecimiento.',
      cta: 'Continuar misión →',
    },
    weekly_digest: {
      subject: '[Glimad] Tu resumen semanal de crecimiento',
      heading: 'Tu semana en Glimad',
      phase_label: 'Fase',
      missions_label: 'Misiones completadas',
      content_label: 'Contenido publicado',
      followers_label: 'Cambio de seguidores',
      cta: 'Ver panel →',
    },
  },
} as const

type SupportedLocale = keyof typeof COPY

function getCopy(locale: string): typeof COPY['en'] {
  return (locale in COPY ? COPY[locale as SupportedLocale] : COPY.en) as typeof COPY['en']
}

// ── Core notification writer ──────────────────────────────────────────────

export async function sendNotification(
  admin: AdminClient,
  opts: {
    projectId: string
    userId: string
    userEmail: string
    type: 'mission_reminder' | 'publish_success' | 'publish_failed' | 'weekly_digest' | 'capability_followup'
    title: string
    body: string
    deliveryChannel?: 'email' | 'in_app'
    metadata?: Record<string, unknown>
    emailSubject?: string
    emailHtml?: string
  }
) {
  const channel = opts.deliveryChannel ?? 'in_app'

  // Insert in-app notification record (title/body stored for reference; UI renders from type+metadata)
  await admin.from('notifications').insert({
    project_id: opts.projectId,
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    delivery_channel: channel,
    metadata_json: opts.metadata ?? {},
    sent_at: new Date().toISOString(),
  })

  // Send email if requested
  if (channel === 'email' && opts.emailSubject && opts.emailHtml) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.userEmail,
      subject: opts.emailSubject,
      html: opts.emailHtml,
    })
  }
}

// ── Mission reminder ──────────────────────────────────────────────────────
// Called by hourly cron. Checks for missions waiting_input > 24h.

export async function sendMissionReminders(admin: AdminClient) {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const { data: staleMissions } = await admin
    .from('mission_instances')
    .select('id, project_id, template_code, updated_at, reminder_sent_at')
    .eq('status', 'needs_user_input')
    .lt('updated_at', cutoff)
    .is('reminder_sent_at', null)  // only send once per wait cycle

  for (const mission of staleMissions ?? []) {
    // Get project owner
    const { data: project } = await admin
      .from('projects')
      .select('user_id')
      .eq('id', mission.project_id)
      .single()

    if (!project) continue

    const { data: authUser } = await admin.auth.admin.getUserById(project.user_id)
    if (!authUser.user?.email) continue

    const userLocale: string = (authUser.user.user_metadata?.locale as string) ?? 'en'
    const c = getCopy(userLocale).mission_reminder

    const template = mission.template_code.replace(/_V\d+$/, '').replace(/_/g, ' ')

    await sendNotification(admin, {
      projectId: mission.project_id,
      userId: project.user_id,
      userEmail: authUser.user.email,
      type: 'mission_reminder',
      title: 'Mission waiting for your input',
      body: `Your mission "${template}" is waiting for your response.`,
      deliveryChannel: 'email',
      metadata: { mission_instance_id: mission.id, template_code: mission.template_code },
      emailSubject: c.subject,
      emailHtml: `
        <h2>${c.heading}</h2>
        <p>${c.body(template)}</p>
        <p>${c.sub}</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/missions/${mission.id}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:white;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px">
          ${c.cta}
        </a>
      `,
    })

    // Mark reminder sent
    await admin
      .from('mission_instances')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', mission.id)
  }
}

// ── Publish notifications ─────────────────────────────────────────────────
// Called by calendar publishing flow.

export async function notifyPublishSuccess(
  admin: AdminClient,
  projectId: string,
  userId: string,
  platform: string,
  contentType: string
) {
  await sendNotification(admin, {
    projectId,
    userId,
    userEmail: '',  // in_app only — email not needed
    type: 'publish_success',
    title: 'Content published',
    body: `Your ${contentType} was published on ${platform}.`,
    deliveryChannel: 'in_app',
    metadata: { platform, content_type: contentType },
  })
}

export async function notifyPublishFailed(
  admin: AdminClient,
  projectId: string,
  userId: string,
  platform: string,
  error: string
) {
  await sendNotification(admin, {
    projectId,
    userId,
    userEmail: '',
    type: 'publish_failed',
    title: 'Publishing failed',
    body: `Failed to publish on ${platform}: ${error}`,
    deliveryChannel: 'in_app',
    metadata: { platform, error },
  })
}

// ── Weekly digest ─────────────────────────────────────────────────────────
// Called by Monday 09:00 UTC cron.

export async function sendWeeklyDigests(admin: AdminClient) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  // Get all active projects
  const { data: projects } = await admin
    .from('projects')
    .select('id, user_id, phase_code')
    .neq('status', 'archived')

  for (const project of projects ?? []) {
    const { data: authUser } = await admin.auth.admin.getUserById(project.user_id)
    if (!authUser.user?.email) continue

    const userLocale: string = (authUser.user.user_metadata?.locale as string) ?? 'en'
    const c = getCopy(userLocale).weekly_digest

    // Aggregate stats
    const [missionsResult, contentResult, metricsNow, metricsWeekAgo] = await Promise.all([
      admin.from('mission_instances').select('id', { count: 'exact', head: true })
        .eq('project_id', project.id).eq('status', 'completed').gte('completed_at', weekAgo),
      admin.from('core_calendar_items').select('id', { count: 'exact', head: true })
        .eq('project_id', project.id).eq('state', 'published').gte('published_at', weekAgo),
      admin.from('platform_metrics').select('followers_count').eq('project_id', project.id)
        .order('fetched_at', { ascending: false }).limit(1).single(),
      admin.from('platform_metrics').select('followers_count').eq('project_id', project.id)
        .lte('fetched_at', weekAgo).order('fetched_at', { ascending: false }).limit(1).single(),
    ])

    const missionsCompleted = missionsResult.count ?? 0
    const contentPublished = contentResult.count ?? 0
    const followersNow = metricsNow.data?.followers_count ?? 0
    const followersWeekAgo = metricsWeekAgo.data?.followers_count ?? 0
    const followerDelta = followersNow - followersWeekAgo
    const followerDeltaStr = `${followerDelta >= 0 ? '+' : ''}${followerDelta}`

    await sendNotification(admin, {
      projectId: project.id,
      userId: project.user_id,
      userEmail: authUser.user.email,
      type: 'weekly_digest',
      title: 'Your weekly growth summary',
      body: `${missionsCompleted} missions · ${contentPublished} posts · ${followerDeltaStr} followers`,
      deliveryChannel: 'email',
      metadata: { missionsCompleted, contentPublished, followerDelta },
      emailSubject: c.subject,
      emailHtml: `
        <h2>${c.heading}</h2>
        <p>${c.phase_label}: <strong>${project.phase_code ?? 'F0'}</strong></p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 16px 8px 0;color:#a1a1aa">${c.missions_label}</td><td style="padding:8px 0;font-weight:bold">${missionsCompleted}</td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#a1a1aa">${c.content_label}</td><td style="padding:8px 0;font-weight:bold">${contentPublished}</td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#a1a1aa">${c.followers_label}</td><td style="padding:8px 0;font-weight:bold;color:${followerDelta >= 0 ? '#10b981' : '#ef4444'}">${followerDeltaStr}</td></tr>
        </table>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:white;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">
          ${c.cta}
        </a>
      `,
    })
  }
}
