// TikTok public profile scraper — no OAuth required
// Step 1: fetch profile page → parse __NEXT_DATA__ for profile stats + secUid
// Step 2: fetch last 10 videos via item_list API using secUid (per-video playCount)
// TikTok has anti-bot measures — will fail if fingerprint is blocked

const TIKTOK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.tiktok.com/',
}

export interface TikTokRawData {
  user: {
    id: string
    uniqueId: string
    secUid: string
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
      diggCount: number   // likes
      shareCount: number
      commentCount: number
      playCount: number   // views
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
  likes_total: number    // total hearts across all videos
  videos_total: number
  bio: string
  is_verified: boolean
}

export async function scrapeTikTok(handle: string): Promise<{ raw: TikTokRawData; normalized: TikTokNormalized }> {
  const username = handle.startsWith('@') ? handle.slice(1) : handle

  // ── Step 1: profile page → __NEXT_DATA__ for stats + secUid ───────────────
  const pageRes = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
    headers: TIKTOK_HEADERS,
  })
  const html = await pageRes.text()

  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
  if (!match) throw new Error(`TikTok: __NEXT_DATA__ not found for @${username} — likely blocked`)

  const nextData = JSON.parse(match[1])
  const userInfo = nextData?.props?.pageProps?.userInfo
  if (!userInfo?.user) throw new Error(`TikTok: userInfo not found in __NEXT_DATA__ for @${username}`)

  const u = userInfo.user
  const stats = userInfo.stats ?? {}

  const secUid: string = u.secUid
  if (!secUid) throw new Error(`TikTok: secUid missing for @${username}`)

  // ── Step 2: fetch last 10 videos via item_list API using secUid ───────────
  const videoRes = await fetch(
    `https://www.tiktok.com/api/post/item_list/?secUid=${encodeURIComponent(secUid)}&count=10&cursor=0&aid=1988&app_name=tiktok_web`,
    { headers: TIKTOK_HEADERS }
  )
  const videoJson = await videoRes.json()

  type TikTokVideoItem = {
    id: string
    createTime: number
    desc: string
    stats: { diggCount: number; shareCount: number; commentCount: number; playCount: number }
  }

  const videos: TikTokRawData['videos'] = (videoJson?.itemList ?? [])
    .slice(0, 10)
    .map((item: TikTokVideoItem) => ({
      id: item.id,
      createTime: item.createTime,
      desc: item.desc ?? '',
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
      secUid,
      nickname: u.nickname ?? '',
      signature: u.signature ?? '',
      verified: u.verified ?? false,
      followerCount: stats.followerCount ?? 0,
      followingCount: stats.followingCount ?? 0,
      heartCount: stats.heartCount ?? 0,
      videoCount: stats.videoCount ?? 0,
    },
    videos,
  }

  // ── Normalize ─────────────────────────────────────────────────────────────
  const now = new Date()
  const videos7d = videos.filter(v => now.getTime() / 1000 - v.createTime < 7 * 86400)
  const videos30d = videos.filter(v => now.getTime() / 1000 - v.createTime < 30 * 86400)

  // Average views per video (primary metric per spec)
  const avgViews = videos.length > 0
    ? videos.reduce((s, v) => s + v.stats.playCount, 0) / videos.length
    : 0

  const avgLikes = videos.length > 0
    ? videos.reduce((s, v) => s + v.stats.diggCount, 0) / videos.length
    : 0

  const avgComments = videos.length > 0
    ? videos.reduce((s, v) => s + v.stats.commentCount, 0) / videos.length
    : 0

  // TikTok ER: (likes + comments) / views
  const avgEr = avgViews > 0 ? (avgLikes + avgComments) / avgViews : 0

  const sortedByViews = [...videos].sort((a, b) => b.stats.playCount - a.stats.playCount)
  const bestVideo = sortedByViews[0] ?? null
  const viralSpike = bestVideo && avgViews > 0 && bestVideo.stats.playCount > avgViews * 3
    ? { post_id: bestVideo.id, multiplier: parseFloat((bestVideo.stats.playCount / avgViews).toFixed(1)) }
    : null

  const lastPostDate = videos.length > 0
    ? new Date(Math.max(...videos.map(v => v.createTime)) * 1000).toISOString()
    : null

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
