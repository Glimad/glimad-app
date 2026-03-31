// Instagram public profile scraper — no OAuth required
// Single call to web_profile_info which returns profile stats AND last 12 posts inline
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
    taken_at: number // unix timestamp (taken_at_timestamp in GraphQL response)
    like_count: number
    comment_count: number
    play_count: number | null // video_view_count for videos/reels
    is_video: boolean
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

  // Single call — returns both profile stats AND last 12 posts in edge_owner_to_timeline_media.edges
  const res = await fetch(
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
  const json = await res.json()
  const user = json?.data?.user
  if (!user) throw new Error(`Instagram profile not found or blocked for: ${username}`)

  // Profile stats — GraphQL field names from web_profile_info response
  const followerCount: number = user.edge_followed_by?.count ?? user.follower_count ?? 0
  const followingCount: number = user.edge_follow?.count ?? user.following_count ?? 0
  const mediaCount: number = user.edge_owner_to_timeline_media?.count ?? user.media_count ?? 0

  // Last 12 posts — embedded in the same response under edge_owner_to_timeline_media.edges
  type GraphEdge = {
    node: {
      id: string
      taken_at_timestamp: number
      edge_liked_by: { count: number }
      edge_media_to_comment: { count: number }
      video_view_count: number | null
      is_video: boolean
    }
  }
  const edges: GraphEdge[] = user.edge_owner_to_timeline_media?.edges ?? []
  const recentMedia: InstagramRawData['recent_media'] = edges.map(({ node }) => ({
    id: node.id,
    taken_at: node.taken_at_timestamp,
    like_count: node.edge_liked_by?.count ?? 0,
    comment_count: node.edge_media_to_comment?.count ?? 0,
    play_count: node.video_view_count ?? null,
    is_video: node.is_video ?? false,
  }))

  const raw: InstagramRawData = {
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name ?? '',
      biography: user.biography ?? '',
      category_name: user.category_name ?? null,
      follower_count: followerCount,
      following_count: followingCount,
      media_count: mediaCount,
      profile_pic_url: user.profile_pic_url ?? '',
      is_verified: user.is_verified ?? false,
      is_private: user.is_private ?? false,
    },
    recent_media: recentMedia,
  }

  // ── Normalize ─────────────────────────────────────────────────────────────
  const now = new Date()

  const posts7d = recentMedia.filter(p => now.getTime() / 1000 - p.taken_at < 7 * 86400)
  const posts30d = recentMedia.filter(p => now.getTime() / 1000 - p.taken_at < 30 * 86400)

  const avgLikes = recentMedia.length > 0
    ? recentMedia.reduce((s, p) => s + p.like_count, 0) / recentMedia.length
    : 0
  const avgComments = recentMedia.length > 0
    ? recentMedia.reduce((s, p) => s + p.comment_count, 0) / recentMedia.length
    : 0
  const avgViews = recentMedia.length > 0
    ? recentMedia.reduce((s, p) => s + (p.play_count ?? 0), 0) / recentMedia.length
    : 0

  // Instagram ER = (avg likes + avg comments) / followers
  const avgEr = followerCount > 0 ? (avgLikes + avgComments) / followerCount : 0

  // Viral spike: any post with likes > 3x average
  const sortedByLikes = [...recentMedia].sort((a, b) => b.like_count - a.like_count)
  const bestPost = sortedByLikes[0] ?? null
  const viralSpike = bestPost && avgLikes > 0 && bestPost.like_count > avgLikes * 3
    ? { post_id: bestPost.id, multiplier: parseFloat((bestPost.like_count / avgLikes).toFixed(1)) }
    : null

  const lastPostDate = recentMedia.length > 0
    ? new Date(Math.max(...recentMedia.map(p => p.taken_at)) * 1000).toISOString()
    : null

  const normalized: InstagramNormalized = {
    followers_total: followerCount,
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
    following_total: followingCount,
    posts_total: mediaCount,
    bio: raw.user.biography,
    category: raw.user.category_name,
    is_verified: raw.user.is_verified,
  }

  return { raw, normalized }
}
