// Instagram public profile scraper — no OAuth required
// Uses Instagram's internal web profile info API (public endpoint, no auth)
// Rate-limited by Instagram — will fail if IP is blocked

export interface InstagramRawData {
  user: {
    id: string
    username: string
    full_name: string
    biography: string
    category_name: string | null
    follower_count: number
    following_count: number
    media_count: number
    profile_pic_url: string
    is_verified: boolean
    is_private: boolean
  }
  recent_media: Array<{
    id: string
    taken_at: number // unix timestamp
    like_count: number
    comment_count: number
    play_count: number | null // for reels/videos
    media_type: number // 1=photo, 2=video, 8=carousel
  }>
}

export interface InstagramNormalized {
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
  // ── Instagram-specific ────────────────────────────────────────────────────
  following_total: number
  posts_total: number
  bio: string
  category: string | null
  is_verified: boolean
}

export async function scrapeInstagram(handle: string): Promise<{ raw: InstagramRawData; normalized: InstagramNormalized }> {
  const username = handle.startsWith('@') ? handle.slice(1) : handle

  // Fetch profile info via Instagram's internal web API
  const profileRes = await fetch(
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    {
      headers: {
        'x-ig-app-id': '936619743392459',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com',
      },
    }
  )
  const profileJson = await profileRes.json()
  const user = profileJson?.data?.user
  if (!user) throw new Error(`Instagram profile not found or blocked for: ${username}`)

  // Fetch recent media via timeline feed
  const mediaRes = await fetch(
    `https://i.instagram.com/api/v1/feed/user/${user.id}/username/?count=12`,
    {
      headers: {
        'x-ig-app-id': '936619743392459',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com',
      },
    }
  )
  const mediaJson = await mediaRes.json()
  const items: InstagramRawData['recent_media'] = (mediaJson?.items ?? []).map((item: {
    id: string
    taken_at: number
    like_count?: number
    comment_count?: number
    play_count?: number
    media_type: number
  }) => ({
    id: item.id,
    taken_at: item.taken_at,
    like_count: item.like_count ?? 0,
    comment_count: item.comment_count ?? 0,
    play_count: item.play_count ?? null,
    media_type: item.media_type,
  }))

  const raw: InstagramRawData = {
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name ?? '',
      biography: user.biography ?? '',
      category_name: user.category_name ?? null,
      follower_count: user.edge_followed_by?.count ?? user.follower_count ?? 0,
      following_count: user.edge_follow?.count ?? user.following_count ?? 0,
      media_count: user.edge_owner_to_timeline_media?.count ?? user.media_count ?? 0,
      profile_pic_url: user.profile_pic_url ?? '',
      is_verified: user.is_verified ?? false,
      is_private: user.is_private ?? false,
    },
    recent_media: items,
  }

  // Normalize
  const now = new Date()
  const msPerDay = 86400000

  const posts7d = items.filter(p => (now.getTime() / 1000 - p.taken_at) < 7 * 86400)
  const posts30d = items.filter(p => (now.getTime() / 1000 - p.taken_at) < 30 * 86400)

  const avgLikes = items.length > 0 ? items.reduce((s, p) => s + p.like_count, 0) / items.length : 0
  const avgComments = items.length > 0 ? items.reduce((s, p) => s + p.comment_count, 0) / items.length : 0
  const avgViews = items.length > 0 ? items.reduce((s, p) => s + (p.play_count ?? 0), 0) / items.length : 0

  const followers = raw.user.follower_count
  // ER = (likes + comments) / followers per post
  const avgEr = followers > 0 ? (avgLikes + avgComments) / followers : 0

  // Viral spike: any post with likes > 3x average
  const sortedByLikes = [...items].sort((a, b) => b.like_count - a.like_count)
  const bestPost = sortedByLikes[0] ?? null
  const viralSpike = bestPost && avgLikes > 0 && bestPost.like_count > avgLikes * 3
    ? { post_id: bestPost.id, multiplier: parseFloat((bestPost.like_count / avgLikes).toFixed(1)) }
    : null

  const lastPostDate = items.length > 0
    ? new Date(Math.max(...items.map(p => p.taken_at)) * 1000).toISOString()
    : null

  void msPerDay // suppress unused warning

  const normalized: InstagramNormalized = {
    followers_total: followers,
    avg_er_estimated: parseFloat(avgEr.toFixed(4)),
    avg_views: Math.round(avgViews),
    avg_likes: Math.round(avgLikes),
    avg_comments: Math.round(avgComments),
    posts_last_7d: posts7d.length,
    posts_last_30d: posts30d.length,
    last_post_date: lastPostDate,
    posts_per_week_average: parseFloat((posts30d.length / 4.3).toFixed(2)),
    monthly_listeners: null,
    viral_spike: viralSpike,
    following_total: raw.user.following_count,
    posts_total: raw.user.media_count,
    bio: raw.user.biography,
    category: raw.user.category_name,
    is_verified: raw.user.is_verified,
  }

  return { raw, normalized }
}
