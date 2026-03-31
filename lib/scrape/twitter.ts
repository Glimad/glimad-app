// Twitter/X API v2 — public profile scraper
// Requires TWITTER_BEARER_TOKEN env var (https://developer.twitter.com → create app → Bearer Token)
// Free tier: user lookup available. Timeline access requires Basic plan ($100/mo) or higher.

const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN!
const TW_BASE = 'https://api.twitter.com/2'

export interface TwitterRawData {
  user: {
    id: string
    name: string
    username: string
    description: string
    verified: boolean
    public_metrics: {
      followers_count: number
      following_count: number
      tweet_count: number
      listed_count: number
    }
  }
  tweets: Array<{
    id: string
    text: string
    created_at: string
    public_metrics: {
      like_count: number
      retweet_count: number
      reply_count: number
      impression_count: number
    }
  }>
}

export interface TwitterNormalized {
  // ── Common fields ──────────────────────────────────────────────────────────
  followers_total: number
  avg_er_estimated: number
  avg_views: number        // avg impressions per tweet
  avg_likes: number
  avg_comments: number     // avg replies per tweet
  posts_last_7d: number
  posts_last_30d: number
  last_post_date: string | null
  posts_per_week_average: number
  monthly_listeners: null
  viral_spike: { post_id: string; multiplier: number } | null
  // ── Twitter-specific ──────────────────────────────────────────────────────
  following_total: number
  tweet_count: number
  avg_retweets: number
  is_verified: boolean
}

async function twFetch(path: string) {
  const res = await fetch(`${TW_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}` },
  })
  return res.json()
}

export async function scrapeTwitter(handle: string): Promise<{ raw: TwitterRawData; normalized: TwitterNormalized }> {
  const username = handle.startsWith('@') ? handle.slice(1) : handle

  // Fetch user profile with public metrics
  const userData = await twFetch(
    `/users/by/username/${encodeURIComponent(username)}?user.fields=description,verified,public_metrics`
  )
  if (!userData?.data) throw new Error(`Twitter user not found: ${username}`)

  const u = userData.data

  // Fetch last 20 tweets with public metrics (likes, retweets, replies, impressions)
  const tweetsData = await twFetch(
    `/users/${u.id}/tweets?max_results=20&tweet.fields=created_at,public_metrics`
  )

  type TweetItem = {
    id: string
    text: string
    created_at: string
    public_metrics: { like_count: number; retweet_count: number; reply_count: number; impression_count: number }
  }

  const tweets: TwitterRawData['tweets'] = (tweetsData?.data ?? []).map((t: TweetItem) => ({
    id: t.id,
    text: t.text,
    created_at: t.created_at,
    public_metrics: {
      like_count: t.public_metrics?.like_count ?? 0,
      retweet_count: t.public_metrics?.retweet_count ?? 0,
      reply_count: t.public_metrics?.reply_count ?? 0,
      impression_count: t.public_metrics?.impression_count ?? 0,
    },
  }))

  const raw: TwitterRawData = {
    user: {
      id: u.id,
      name: u.name,
      username: u.username,
      description: u.description ?? '',
      verified: u.verified ?? false,
      public_metrics: {
        followers_count: u.public_metrics?.followers_count ?? 0,
        following_count: u.public_metrics?.following_count ?? 0,
        tweet_count: u.public_metrics?.tweet_count ?? 0,
        listed_count: u.public_metrics?.listed_count ?? 0,
      },
    },
    tweets,
  }

  // ── Normalize ─────────────────────────────────────────────────────────────
  const now = new Date()
  const tweets7d = tweets.filter(t => now.getTime() - new Date(t.created_at).getTime() < 7 * 86400000)
  const tweets30d = tweets.filter(t => now.getTime() - new Date(t.created_at).getTime() < 30 * 86400000)

  const avgLikes = tweets.length > 0
    ? tweets.reduce((s, t) => s + t.public_metrics.like_count, 0) / tweets.length
    : 0
  const avgRetweets = tweets.length > 0
    ? tweets.reduce((s, t) => s + t.public_metrics.retweet_count, 0) / tweets.length
    : 0
  const avgReplies = tweets.length > 0
    ? tweets.reduce((s, t) => s + t.public_metrics.reply_count, 0) / tweets.length
    : 0
  const avgImpressions = tweets.length > 0
    ? tweets.reduce((s, t) => s + t.public_metrics.impression_count, 0) / tweets.length
    : 0

  const followers = raw.user.public_metrics.followers_count
  // Twitter ER = (likes + retweets + replies) / followers
  const avgEr = followers > 0 ? (avgLikes + avgRetweets + avgReplies) / followers : 0

  // Viral spike: any tweet with likes > 3x average
  const sortedByLikes = [...tweets].sort((a, b) => b.public_metrics.like_count - a.public_metrics.like_count)
  const bestTweet = sortedByLikes[0] ?? null
  const viralSpike = bestTweet && avgLikes > 0 && bestTweet.public_metrics.like_count > avgLikes * 3
    ? { post_id: bestTweet.id, multiplier: parseFloat((bestTweet.public_metrics.like_count / avgLikes).toFixed(1)) }
    : null

  const lastPostDate = tweets.length > 0
    ? tweets.reduce((latest, t) => t.created_at > latest ? t.created_at : latest, tweets[0].created_at)
    : null

  const normalized: TwitterNormalized = {
    followers_total: followers,
    avg_er_estimated: parseFloat(avgEr.toFixed(4)),
    avg_views: Math.round(avgImpressions),
    avg_likes: Math.round(avgLikes),
    avg_comments: Math.round(avgReplies),
    posts_last_7d: tweets7d.length,
    posts_last_30d: tweets30d.length,
    last_post_date: lastPostDate,
    posts_per_week_average: parseFloat((tweets30d.length / 4.3).toFixed(2)),
    monthly_listeners: null,
    viral_spike: viralSpike,
    following_total: raw.user.public_metrics.following_count,
    tweet_count: raw.user.public_metrics.tweet_count,
    avg_retweets: Math.round(avgRetweets),
    is_verified: raw.user.verified,
  }

  return { raw, normalized }
}
