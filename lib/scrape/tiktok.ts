// TikTok public profile scraper — no OAuth required
// Fetches the profile HTML page and parses the embedded __NEXT_DATA__ JSON blob
// TikTok has anti-bot measures — will fail if fingerprint is blocked

export interface TikTokRawData {
  user: {
    id: string
    uniqueId: string
    nickname: string
    signature: string
    verified: boolean
    followerCount: number
    followingCount: number
    heartCount: number
    videoCount: number
  }
  videos: Array<{
    id: string
    createTime: number // unix timestamp
    desc: string
    stats: {
      diggCount: number
      shareCount: number
      commentCount: number
      playCount: number
    }
  }>
}

export interface TikTokNormalized {
  // ── Common fields ──────────────────────────────────────────────────────────
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
  // ── TikTok-specific ───────────────────────────────────────────────────────
  following_total: number
  likes_total: number
  videos_total: number
  bio: string
  is_verified: boolean
}

export async function scrapeTikTok(handle: string): Promise<{ raw: TikTokRawData; normalized: TikTokNormalized }> {
  const username = handle.startsWith('@') ? handle.slice(1) : handle

  // Fetch profile page — parse __NEXT_DATA__ JSON blob
  const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  const html = await res.text()

  // Extract __NEXT_DATA__ script
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
  if (!match) throw new Error(`TikTok: __NEXT_DATA__ not found for @${username} — likely blocked`)

  const nextData = JSON.parse(match[1])

  // Navigate to user detail — structure varies by TikTok's Next.js version
  const userModule =
    nextData?.props?.pageProps?.userInfo ||
    nextData?.props?.pageProps?.itemList?.[0]?.author ||
    nextData?.props?.pageProps?.user

  if (!userModule?.user) throw new Error(`TikTok: user data not found in page JSON for @${username}`)

  const u = userModule.user
  const stats = userModule.stats ?? {}

  // TikTok doesn't expose per-video stats on the profile page easily
  // itemList may or may not be present depending on rendering mode
  const itemList: TikTokRawData['videos'] = (nextData?.props?.pageProps?.itemList ?? [])
    .map((item: {
      id: string
      createTime: number
      desc: string
      stats: { diggCount: number; shareCount: number; commentCount: number; playCount: number }
    }) => ({
      id: item.id,
      createTime: item.createTime,
      desc: item.desc,
      stats: {
        diggCount: item.stats?.diggCount ?? 0,
        shareCount: item.stats?.shareCount ?? 0,
        commentCount: item.stats?.commentCount ?? 0,
        playCount: item.stats?.playCount ?? 0,
      },
    }))

  const raw: TikTokRawData = {
    user: {
      id: u.id,
      uniqueId: u.uniqueId,
      nickname: u.nickname ?? '',
      signature: u.signature ?? '',
      verified: u.verified ?? false,
      followerCount: stats.followerCount ?? 0,
      followingCount: stats.followingCount ?? 0,
      heartCount: stats.heartCount ?? 0,
      videoCount: stats.videoCount ?? 0,
    },
    videos: itemList,
  }

  // Normalize
  const now = new Date()
  const videos7d = itemList.filter(v => now.getTime() / 1000 - v.createTime < 7 * 86400)
  const videos30d = itemList.filter(v => now.getTime() / 1000 - v.createTime < 30 * 86400)

  const avgViews = itemList.length > 0 ? itemList.reduce((s, v) => s + v.stats.playCount, 0) / itemList.length : 0
  const avgLikes = itemList.length > 0 ? itemList.reduce((s, v) => s + v.stats.diggCount, 0) / itemList.length : 0
  const avgComments = itemList.length > 0 ? itemList.reduce((s, v) => s + v.stats.commentCount, 0) / itemList.length : 0

  const followers = raw.user.followerCount
  // TikTok ER: (likes + comments) / views
  const avgEr = avgViews > 0 ? (avgLikes + avgComments) / avgViews : 0

  const sortedByViews = [...itemList].sort((a, b) => b.stats.playCount - a.stats.playCount)
  const bestVideo = sortedByViews[0] ?? null
  const viralSpike = bestVideo && avgViews > 0 && bestVideo.stats.playCount > avgViews * 3
    ? { post_id: bestVideo.id, multiplier: parseFloat((bestVideo.stats.playCount / avgViews).toFixed(1)) }
    : null

  const lastPostDate = itemList.length > 0
    ? new Date(Math.max(...itemList.map(v => v.createTime)) * 1000).toISOString()
    : null

  void followers

  const normalized: TikTokNormalized = {
    followers_total: raw.user.followerCount,
    avg_er_estimated: parseFloat(avgEr.toFixed(4)),
    avg_views: Math.round(avgViews),
    avg_likes: Math.round(avgLikes),
    avg_comments: Math.round(avgComments),
    posts_last_7d: videos7d.length,
    posts_last_30d: videos30d.length,
    last_post_date: lastPostDate,
    posts_per_week_average: parseFloat((videos30d.length / 4.3).toFixed(2)),
    monthly_listeners: null,
    viral_spike: viralSpike,
    following_total: raw.user.followingCount,
    likes_total: raw.user.heartCount,
    videos_total: raw.user.videoCount,
    bio: raw.user.signature,
    is_verified: raw.user.verified,
  }

  return { raw, normalized }
}
