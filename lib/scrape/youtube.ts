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
  followers_total: number
  videos_total: number
  views_total: number
  avg_views_last10: number
  avg_likes_last10: number
  avg_comments_last10: number
  avg_er_estimated: number
  posts_last_7d: number
  posts_last_30d: number
  best_video_id: string | null
  best_video_views: number
  viral_spike: { video_id: string; multiplier: number } | null
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
  const avgEr = avgViews > 0 ? ((avgLikes + avgComments) / avgViews) : 0

  // Viral spike: any video with views > 3x average
  const sortedByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount)
  const bestVideo = sortedByViews[0] ?? null
  const viralSpike = bestVideo && avgViews > 0 && bestVideo.viewCount > avgViews * 3
    ? { video_id: bestVideo.id, multiplier: parseFloat((bestVideo.viewCount / avgViews).toFixed(1)) }
    : null

  const normalized: YouTubeNormalized = {
    followers_total: channel.subscriberCount,
    videos_total: channel.videoCount,
    views_total: channel.viewCount,
    avg_views_last10: Math.round(avgViews),
    avg_likes_last10: Math.round(avgLikes),
    avg_comments_last10: Math.round(avgComments),
    avg_er_estimated: parseFloat(avgEr.toFixed(4)),
    posts_last_7d: videos7d.length,
    posts_last_30d: videos30d.length,
    best_video_id: bestVideo?.id ?? null,
    best_video_views: bestVideo?.viewCount ?? 0,
    viral_spike: viralSpike,
  }

  return { raw: { channel, videos }, normalized }
}
