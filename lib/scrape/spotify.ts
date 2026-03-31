// Spotify scraper — three data sources:
// 1. Web API (client credentials) → follower count, top tracks
// 2. open.spotify.com artist page → monthly listeners (not in public Web API)
// No user OAuth required

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!

export interface SpotifyRawData {
  artist: {
    id: string
    name: string
    type: 'artist'
    followers: number
    monthly_listeners: number | null
    popularity: number // 0-100, Spotify-calculated
    genres: string[]
    uri: string
  }
  topTracks: Array<{
    id: string
    name: string
    popularity: number
    preview_url: string | null
    album: string
    release_date: string
  }>
}

export interface SpotifyNormalized {
  // ── Common fields ──────────────────────────────────────────────────────────
  followers_total: number
  avg_er_estimated: number   // not applicable for Spotify, 0
  avg_views: number          // not applicable, 0
  avg_likes: number          // not applicable, 0
  avg_comments: number       // not applicable, 0
  posts_last_7d: number      // not applicable, 0
  posts_last_30d: number     // not applicable, 0
  last_post_date: string | null
  posts_per_week_average: number  // not applicable, 0
  monthly_listeners: number | null
  viral_spike: null
  // ── Spotify-specific ──────────────────────────────────────────────────────
  popularity: number
  genres: string[]
  top_tracks: Array<{ name: string; popularity: number; release_date: string }>
}

async function getSpotifyToken(): Promise<string> {
  const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  return data.access_token as string
}

async function spotifyFetch(path: string, token: string) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  return res.json()
}

// Fetch monthly listeners from the public artist page __NEXT_DATA__ blob
// The Spotify Web API does not expose monthly listeners — only the public page does
async function fetchMonthlyListeners(artistId: string): Promise<number | null> {
  const res = await fetch(`https://open.spotify.com/artist/${artistId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  const html = await res.text()

  // Parse __NEXT_DATA__ — Spotify embeds artist stats here
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
  if (match) {
    const nextData = JSON.parse(match[1])
    const listeners =
      nextData?.props?.pageProps?.serverSideProps?.data?.artist?.stats?.monthlyListeners ??
      nextData?.props?.pageProps?.data?.artist?.stats?.monthlyListeners ??
      null
    if (listeners !== null) return Number(listeners)
  }

  // Fallback: regex on rendered HTML text (e.g. "1,234,567 monthly listeners")
  const textMatch = html.match(/([\d,]+)\s+monthly listeners/i)
  if (textMatch) return parseInt(textMatch[1].replace(/,/g, ''), 10)

  return null
}

export async function scrapeSpotify(handle: string): Promise<{ raw: SpotifyRawData; normalized: SpotifyNormalized }> {
  const token = await getSpotifyToken()

  // Resolve artist ID from handle — accepts Spotify URI, open.spotify.com URL, or artist name
  let artistId: string | null = null

  if (handle.includes('spotify:artist:')) {
    artistId = handle.split('spotify:artist:')[1]
  } else if (handle.includes('open.spotify.com/artist/')) {
    artistId = handle.split('/artist/')[1].split('?')[0]
  } else {
    const query = handle.startsWith('@') ? handle.slice(1) : handle
    const searchData = await spotifyFetch(
      `/search?q=${encodeURIComponent(query)}&type=artist&limit=1`,
      token
    )
    artistId = searchData?.artists?.items?.[0]?.id ?? null
  }

  if (!artistId) throw new Error(`Spotify artist not found for: ${handle}`)

  // Fetch artist details (followers, popularity, genres) and monthly listeners in parallel
  const [artistData, tracksData, monthlyListeners] = await Promise.all([
    spotifyFetch(`/artists/${artistId}`, token),
    spotifyFetch(`/artists/${artistId}/top-tracks?market=US`, token),
    fetchMonthlyListeners(artistId),
  ])

  if (!artistData?.id) throw new Error(`Spotify artist data empty for id: ${artistId}`)

  const topTracks: SpotifyRawData['topTracks'] = (tracksData?.tracks ?? []).slice(0, 10).map((t: {
    id: string
    name: string
    popularity: number
    preview_url: string | null
    album: { name: string; release_date: string }
  }) => ({
    id: t.id,
    name: t.name,
    popularity: t.popularity,
    preview_url: t.preview_url,
    album: t.album.name,
    release_date: t.album.release_date,
  }))

  const raw: SpotifyRawData = {
    artist: {
      id: artistData.id,
      name: artistData.name,
      type: 'artist',
      followers: artistData.followers?.total ?? 0,
      monthly_listeners: monthlyListeners,
      popularity: artistData.popularity ?? 0,
      genres: artistData.genres ?? [],
      uri: artistData.uri,
    },
    topTracks,
  }

  // Most recent release date from top tracks
  const lastPostDate = topTracks.length > 0
    ? topTracks.reduce((latest, t) => t.release_date > latest ? t.release_date : latest, topTracks[0].release_date)
    : null

  const normalized: SpotifyNormalized = {
    followers_total: raw.artist.followers,
    avg_er_estimated: 0,
    avg_views: 0,
    avg_likes: 0,
    avg_comments: 0,
    posts_last_7d: 0,
    posts_last_30d: 0,
    last_post_date: lastPostDate,
    posts_per_week_average: 0,
    monthly_listeners: raw.artist.monthly_listeners,
    viral_spike: null,
    popularity: raw.artist.popularity,
    genres: raw.artist.genres,
    top_tracks: topTracks.map(t => ({
      name: t.name,
      popularity: t.popularity,
      release_date: t.release_date,
    })),
  }

  return { raw, normalized }
}
