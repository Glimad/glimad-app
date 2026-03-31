// YouTube Data API v3 — public channel scraper
// Requires YOUTUBE_API_KEY env var (no OAuth, public data only)

const YT_API_KEY = process.env.YOUTUBE_API_KEY!
const YT_BASE = 'https://www.googleapis.com/youtube/v3'

export interface YouTubeRawData {
  channel: {
    id: string
    title: string
    subscriberCount: number
    videoCount: number
    viewCount: number
  }
  videos: Array<{
    id: string
    title: string
    publishedAt: string
    viewCount: number
    likeCount: number
    commentCount: number
  }>
}

export interface YouTubeNormalized {
  // ── Common fields (shared across all platforms) ──────────────────────────
  followers_total: number
  avg_er_estimated: number
  avg_views: number
  avg_likes: number
  avg_comments: number
  posts_last_7d: number
  posts_last_30d: number
  last_post_date: string | null
  posts_per_week_average: number
  monthly_listeners: null
  viral_spike: { post_id: string; multiplier: number } | null
  // ── YouTube-specific ──────────────────────────────────────────────────────
  videos_total: number
  views_total: number
  best_video_id: string | null
  best_video_views: number
}

async function ytFetch(path: string) {
  const res = await fetch(`${YT_BASE}${path}&key=${YT_API_KEY}`)
  return res.json()
}

async function getChannelIdByHandle(handle: string): Promise<string | null> {
  // handle can be @username or channel ID (UC...)
  if (handle.startsWith('UC')) return handle

  const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle
  const data = await ytFetch(`/channels?part=id&forHandle=${encodeURIComponent(cleanHandle)}`)
  return data.items?.[0]?.id ?? null
}

export async function scrapeYouTube(handle: string): Promise<{ raw: YouTubeRawData; normalized: YouTubeNormalized }> {
  const channelId = await getChannelIdByHandle(handle)
  if (!channelId) throw new Error(`YouTube channel not found for handle: ${handle}`)

  // Fetch channel stats
  const channelData = await ytFetch(
    `/channels?part=snippet,statistics&id=${channelId}`
  )
  const ch = channelData.items?.[0]
  if (!ch) throw new Error(`YouTube channel data empty for id: ${channelId}`)

  const channel = {
    id: channelId,
    title: ch.snippet.title as string,
    subscriberCount: parseInt(ch.statistics.subscriberCount ?? '0', 10),
    videoCount: parseInt(ch.statistics.videoCount ?? '0', 10),
    viewCount: parseInt(ch.statistics.viewCount ?? '0', 10),
  }

  // Fetch latest 10 videos
  const searchData = await ytFetch(
    `/search?part=id&channelId=${channelId}&order=date&maxResults=10&type=video`
  )
  const videoIds = (searchData.items ?? []).map((v: { id: { videoId: string } }) => v.id.videoId).filter(Boolean)

  let videos: YouTubeRawData['videos'] = []
  if (videoIds.length > 0) {
    const videoData = await ytFetch(
      `/videos?part=snippet,statistics&id=${videoIds.join(',')}`
    )
    videos = (videoData.items ?? []).map((v: {
      id: string
      snippet: { title: string; publishedAt: string }
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string }
    }) => ({
      id: v.id,
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt,
      viewCount: parseInt(v.statistics.viewCount ?? '0', 10),
      likeCount: parseInt(v.statistics.likeCount ?? '0', 10),
      commentCount: parseInt(v.statistics.commentCount ?? '0', 10),
    }))
  }

  // Normalize
  const now = new Date()
  const msPerDay = 86400000
  const videos7d = videos.filter(v => now.getTime() - new Date(v.publishedAt).getTime() < 7 * msPerDay)
  const videos30d = videos.filter(v => now.getTime() - new Date(v.publishedAt).getTime() < 30 * msPerDay)

  const avgViews = videos.length > 0 ? videos.reduce((s, v) => s + v.viewCount, 0) / videos.length : 0
  const avgLikes = videos.length > 0 ? videos.reduce((s, v) => s + v.likeCount, 0) / videos.length : 0
  const avgComments = videos.length > 0 ? videos.reduce((s, v) => s + v.commentCount, 0) / videos.length : 0

  // Estimated ER: (likes + comments) / views per video average
  const avgEr = avgViews > 0 ? (avgLikes + avgComments) / avgViews : 0

  // Viral spike: any video with views > 3x average
  const sortedByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount)
  const bestVideo = sortedByViews[0] ?? null
  const viralSpike = bestVideo && avgViews > 0 && bestVideo.viewCount > avgViews * 3
    ? { post_id: bestVideo.id, multiplier: parseFloat((bestVideo.viewCount / avgViews).toFixed(1)) }
    : null

  // Most recent post date (videos sorted by publishedAt desc from API)
  const lastPostDate = videos.length > 0
    ? videos.reduce((latest, v) => v.publishedAt > latest ? v.publishedAt : latest, videos[0].publishedAt)
    : null

  // Posts per week: based on last 30 days window
  const postsPerWeek = parseFloat((videos30d.length / 4.3).toFixed(2))

  const normalized: YouTubeNormalized = {
    followers_total: channel.subscriberCount,
    avg_er_estimated: parseFloat(avgEr.toFixed(4)),
    avg_views: Math.round(avgViews),
    avg_likes: Math.round(avgLikes),
    avg_comments: Math.round(avgComments),
    posts_last_7d: videos7d.length,
    posts_last_30d: videos30d.length,
    last_post_date: lastPostDate,
    posts_per_week_average: postsPerWeek,
    monthly_listeners: null,
    viral_spike: viralSpike,
    // YouTube-specific
    videos_total: channel.videoCount,
    views_total: channel.viewCount,
    best_video_id: bestVideo?.id ?? null,
    best_video_views: bestVideo?.viewCount ?? 0,
  }

  return { raw: { channel, videos }, normalized }
}
