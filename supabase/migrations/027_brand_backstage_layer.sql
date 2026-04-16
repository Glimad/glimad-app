-- Migration: 027_brand_backstage_layer.sql
-- Brief 8: Brand Backstage Layer - Infrastructure for B2B exposure to creators
-- Created at: 2026-04-17

-- ============================================================================
-- 1. Niche Taxonomy System
-- ============================================================================

CREATE TABLE IF NOT EXISTS core_niche_taxonomy (
  niche_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_code TEXT REFERENCES core_niche_taxonomy(niche_code) ON DELETE SET NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 2),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_niche_taxonomy_parent ON core_niche_taxonomy(parent_code);
CREATE INDEX idx_niche_taxonomy_active ON core_niche_taxonomy(active);

-- Seed main niches
INSERT INTO core_niche_taxonomy (niche_code, name, level, keywords) VALUES
  ('psychology_wellness', 'Psicología y Bienestar', 1, ARRAY['psychology','wellness','mental_health','mindfulness']),
  ('fitness_nutrition', 'Fitness y Nutrición', 1, ARRAY['fitness','gym','nutrition','workout','diet']),
  ('education_development', 'Educación y Desarrollo Personal', 1, ARRAY['education','learning','personal_development','coaching']),
  ('business_finance', 'Negocios y Finanzas', 1, ARRAY['business','entrepreneurship','finance','investment']),
  ('tech_software', 'Tecnología y Software', 1, ARRAY['technology','programming','software','AI','coding']),
  ('lifestyle_entertainment', 'Lifestyle y Entretenimiento', 1, ARRAY['lifestyle','travel','fashion','entertainment','entertainment']),
  ('creative_arts', 'Arte y Creatividad', 1, ARRAY['art','design','photography','music','writing']),
  ('food_cooking', 'Gastronomía y Cocina', 1, ARRAY['cooking','recipes','gastronomy','food','cuisine'])
ON CONFLICT (niche_code) DO NOTHING;

-- ============================================================================
-- 2. Brand Profiles Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS core_brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Public identity (anonymizable)
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  niche_primary TEXT NOT NULL REFERENCES core_niche_taxonomy(niche_code) ON DELETE RESTRICT,
  niche_secondary TEXT[] DEFAULT '{}',
  platform_focus TEXT NOT NULL CHECK (platform_focus IN ('instagram', 'tiktok', 'youtube', 'linkedin', 'twitter')),
  
  -- Follower tier (binned)
  follower_tier TEXT NOT NULL CHECK (follower_tier IN (
    'nano_0_1k', 'nano_1k_5k', 'micro_5k_25k',
    'mid_25k_100k', 'macro_100k_250k', 'mega_250k_plus'
  )),
  
  -- Opt-in consent
  opted_in BOOLEAN NOT NULL DEFAULT false,
  opted_in_at TIMESTAMPTZ,
  opt_out_at TIMESTAMPTZ,
  consent_version TEXT DEFAULT 'v1',
  
  -- Versioning
  profile_version INTEGER NOT NULL DEFAULT 1,
  last_score_update TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brand_profiles_opted_in ON core_brand_profiles(opted_in) WHERE opted_in = true;
CREATE INDEX idx_brand_profiles_niche ON core_brand_profiles(niche_primary);
CREATE INDEX idx_brand_profiles_follower_tier ON core_brand_profiles(follower_tier);
CREATE INDEX idx_brand_profiles_updated ON core_brand_profiles(updated_at DESC);

-- ============================================================================
-- 3. Brand Scores Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS core_brand_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id UUID NOT NULL REFERENCES core_brand_profiles(id) ON DELETE CASCADE,
  
  -- Scores (0-100 scale)
  growth_score INTEGER CHECK (growth_score >= 0 AND growth_score <= 100),
  engagement_score INTEGER CHECK (engagement_score >= 0 AND engagement_score <= 100),
  consistency_score INTEGER CHECK (consistency_score >= 0 AND consistency_score <= 100),
  brand_safety_score INTEGER CHECK (brand_safety_score >= 0 AND brand_safety_score <= 100),
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Calculation metadata
  calculation_version TEXT NOT NULL DEFAULT 'v1',
  input_signals_count INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Snapshot period (30-day windows)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brand_scores_profile ON core_brand_scores(brand_profile_id, created_at DESC);
CREATE INDEX idx_brand_scores_overall ON core_brand_scores(overall_score DESC);
CREATE INDEX idx_brand_scores_period ON core_brand_scores(period_start, period_end);

-- ============================================================================
-- 4. Brand API Keys Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS core_brand_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Brand info
  brand_name TEXT NOT NULL,
  brand_email TEXT NOT NULL,
  brand_website TEXT,
  
  -- API key (hashed)
  api_key_hash TEXT UNIQUE NOT NULL,
  api_key_prefix TEXT NOT NULL UNIQUE, -- First 8 chars for identification
  
  -- Tier & limits
  tier TEXT NOT NULL CHECK (tier IN ('basic', 'pro', 'enterprise')) DEFAULT 'basic',
  rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
  rate_limit_daily INTEGER NOT NULL DEFAULT 1000,
  max_results_per_request INTEGER NOT NULL DEFAULT 100,
  
  -- Scopes
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read:profiles','read:scores','read:niches'],
  
  -- Status lifecycle
  status TEXT NOT NULL CHECK (status IN ('pending','active','suspended','revoked')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Metadata
  created_by_ip TEXT,
  last_used_ip TEXT
);

CREATE INDEX idx_brand_api_keys_prefix ON core_brand_api_keys(api_key_prefix);
CREATE INDEX idx_brand_api_keys_status ON core_brand_api_keys(status) WHERE status = 'active';
CREATE INDEX idx_brand_api_keys_tier ON core_brand_api_keys(tier);

-- ============================================================================
-- 5. Brand API Usage Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS core_brand_api_usage (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES core_brand_api_keys(id) ON DELETE CASCADE,
  
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('GET','POST','PUT','DELETE')),
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  
  request_size_bytes INTEGER,
  response_size_bytes INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brand_api_usage_key ON core_brand_api_usage(api_key_id, created_at DESC);
CREATE INDEX idx_brand_api_usage_time ON core_brand_api_usage(created_at DESC);

-- Cleanup policy: keep 90 days of usage logs
-- (Would be implemented as a scheduled job/cron)

-- ============================================================================
-- 6. Brand Score Calculation History (audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS core_brand_score_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  run_date DATE NOT NULL,
  run_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  total_profiles_processed INTEGER NOT NULL,
  profiles_updated INTEGER NOT NULL,
  
  calculation_version TEXT NOT NULL DEFAULT 'v1',
  
  errors_count INTEGER NOT NULL DEFAULT 0,
  error_details JSONB,
  
  execution_time_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','partial_failure','failed')) DEFAULT 'success',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brand_score_runs_date ON core_brand_score_runs(run_date DESC);
CREATE INDEX idx_brand_score_runs_status ON core_brand_score_runs(status);

-- ============================================================================
-- 7. PII Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS core_brand_pii_audit (
  id BIGSERIAL PRIMARY KEY,
  
  api_key_id UUID NOT NULL REFERENCES core_brand_api_keys(id) ON DELETE CASCADE,
  
  -- What they tried to access
  attempted_table TEXT NOT NULL,
  attempted_fields TEXT[] NOT NULL,
  
  -- Action
  action TEXT NOT NULL CHECK (action IN ('denied','allowed_filtered')),
  reason TEXT,
  
  -- IP & user agent
  request_ip TEXT,
  request_ua TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brand_pii_audit_key ON core_brand_pii_audit(api_key_id, created_at DESC);
CREATE INDEX idx_brand_pii_audit_action ON core_brand_pii_audit(action);

-- ============================================================================
-- 8. RLS Policies (Data isolation)
-- ============================================================================

ALTER TABLE core_brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_brand_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_brand_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_brand_api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_brand_score_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_brand_pii_audit ENABLE ROW LEVEL SECURITY;

-- Only service_role can write brand data
CREATE POLICY brand_profiles_insert_service_role ON core_brand_profiles
  FOR INSERT TO authenticated USING (false);

CREATE POLICY brand_profiles_read_authenticated ON core_brand_profiles
  FOR SELECT TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  ));

-- Brand API keys: only service_role reads (via authenticated function calls)
CREATE POLICY brand_api_keys_read_service_only ON core_brand_api_keys
  FOR SELECT TO authenticated USING (false);

-- ============================================================================
-- 9. Follower Tier Binning Function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_follower_tier(follower_count INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN follower_count < 1000 THEN 'nano_0_1k'
    WHEN follower_count < 5000 THEN 'nano_1k_5k'
    WHEN follower_count < 25000 THEN 'micro_5k_25k'
    WHEN follower_count < 100000 THEN 'mid_25k_100k'
    WHEN follower_count < 250000 THEN 'macro_100k_250k'
    ELSE 'mega_250k_plus'
  END;
$$;

-- ============================================================================
-- 10. Comments & Grants
-- ============================================================================

COMMENT ON TABLE core_brand_profiles IS 'Public creator profiles for brand B2B discovery - opted-in only, PII-filtered';
COMMENT ON TABLE core_brand_scores IS 'Calculated scores from Brain (growth, engagement, consistency, brand_safety)';
COMMENT ON TABLE core_brand_scores.overall_score IS 'Composite: 0.25*growth + 0.35*engagement + 0.25*consistency + 0.15*brand_safety';
COMMENT ON TABLE core_brand_api_keys IS 'API credentials for brands - use X-Brand-API-Key header for auth';
COMMENT ON TABLE core_brand_api_usage IS 'Audit log of all Brand API requests (90-day retention)';

-- Service role can do anything (Edge Functions use this)
-- Anon key restricted by RLS policies above
