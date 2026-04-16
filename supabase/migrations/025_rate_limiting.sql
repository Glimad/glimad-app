-- ============================================================
-- Migration: Rate Limiting System
-- Brief 4: Rate Limiting Infrastructure
-- ============================================================

-- Rate limit tracking table (for persistent rate limits)
CREATE TABLE IF NOT EXISTS rate_limit_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,           -- user_id, ip_address, api_key
    identifier_type TEXT NOT NULL DEFAULT 'user_id',  -- 'user_id', 'ip', 'api_key'
    endpoint TEXT NOT NULL,             -- API endpoint or action type
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INTEGER NOT NULL DEFAULT 1,
    window_size_seconds INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(identifier, identifier_type, endpoint, window_start)
);

-- Rate limit configurations table
CREATE TABLE IF NOT EXISTS rate_limit_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    endpoint_pattern TEXT NOT NULL,     -- Regex or exact match pattern
    max_requests INTEGER NOT NULL,
    window_seconds INTEGER NOT NULL DEFAULT 60,
    burst_limit INTEGER,                -- Optional burst allowance
    tier TEXT NOT NULL DEFAULT 'default', -- 'starter', 'growth', 'scale', 'default'
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    bypass_roles TEXT[] DEFAULT '{}',   -- Roles that bypass this limit
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rate limit violations log (for security monitoring)
CREATE TABLE IF NOT EXISTS rate_limit_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,
    identifier_type TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    config_name TEXT,
    limit_value INTEGER NOT NULL,
    current_count INTEGER NOT NULL,
    ip_address INET,
    user_agent TEXT,
    headers JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IP blocklist for severe rate limit abuse
CREATE TABLE IF NOT EXISTS rate_limit_blocklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address INET NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    violation_count INTEGER NOT NULL DEFAULT 1,
    blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,             -- NULL = permanent
    blocked_by TEXT,                    -- admin or 'auto'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes for Performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_lookup 
    ON rate_limit_entries(identifier, identifier_type, endpoint, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_cleanup 
    ON rate_limit_entries(window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_pattern 
    ON rate_limit_configs(endpoint_pattern);

CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_tier 
    ON rate_limit_configs(tier, enabled);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_time 
    ON rate_limit_violations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_identifier 
    ON rate_limit_violations(identifier, identifier_type);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocklist_ip 
    ON rate_limit_blocklist(ip_address);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocklist_expires 
    ON rate_limit_blocklist(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================
-- Helper Functions
-- ============================================================

-- Check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(p_ip_address INET)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM rate_limit_blocklist
        WHERE ip_address = p_ip_address
        AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment rate limit counter (sliding window)
CREATE OR REPLACE FUNCTION increment_rate_limit(
    p_identifier TEXT,
    p_identifier_type TEXT,
    p_endpoint TEXT,
    p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE(current_count INTEGER, window_start TIMESTAMPTZ) AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    -- Calculate current window start
    v_window_start := date_trunc('second', NOW()) - 
        ((EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) * INTERVAL '1 second');
    
    -- Insert or update the rate limit entry
    INSERT INTO rate_limit_entries (
        identifier, identifier_type, endpoint, window_start, 
        request_count, window_size_seconds
    )
    VALUES (
        p_identifier, p_identifier_type, p_endpoint, v_window_start,
        1, p_window_seconds
    )
    ON CONFLICT (identifier, identifier_type, endpoint, window_start)
    DO UPDATE SET 
        request_count = rate_limit_entries.request_count + 1,
        updated_at = NOW()
    RETURNING rate_limit_entries.request_count, rate_limit_entries.window_start
    INTO v_count, v_window_start;
    
    RETURN QUERY SELECT v_count, v_window_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current rate limit status
CREATE OR REPLACE FUNCTION get_rate_limit_status(
    p_identifier TEXT,
    p_identifier_type TEXT,
    p_endpoint TEXT,
    p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE(current_count INTEGER, window_start TIMESTAMPTZ, window_end TIMESTAMPTZ) AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
BEGIN
    v_window_start := date_trunc('second', NOW()) - 
        ((EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) * INTERVAL '1 second');
    
    RETURN QUERY
    SELECT 
        COALESCE(rle.request_count, 0)::INTEGER,
        v_window_start,
        v_window_start + (p_window_seconds * INTERVAL '1 second')
    FROM (SELECT 1) AS dummy
    LEFT JOIN rate_limit_entries rle 
        ON rle.identifier = p_identifier
        AND rle.identifier_type = p_identifier_type
        AND rle.endpoint = p_endpoint
        AND rle.window_start = v_window_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log rate limit violation
CREATE OR REPLACE FUNCTION log_rate_violation(
    p_identifier TEXT,
    p_identifier_type TEXT,
    p_endpoint TEXT,
    p_config_name TEXT,
    p_limit_value INTEGER,
    p_current_count INTEGER,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_headers JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO rate_limit_violations (
        identifier, identifier_type, endpoint, config_name,
        limit_value, current_count, ip_address, user_agent, headers
    )
    VALUES (
        p_identifier, p_identifier_type, p_endpoint, p_config_name,
        p_limit_value, p_current_count, p_ip_address, p_user_agent, p_headers
    )
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old rate limit entries (run via cron)
CREATE OR REPLACE FUNCTION cleanup_rate_limit_entries(
    p_older_than INTERVAL DEFAULT INTERVAL '1 hour'
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM rate_limit_entries
    WHERE window_start < NOW() - p_older_than;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-block IP after repeated violations
CREATE OR REPLACE FUNCTION auto_block_ip(
    p_ip_address INET,
    p_threshold INTEGER DEFAULT 100,
    p_time_window INTERVAL DEFAULT INTERVAL '1 hour',
    p_block_duration INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_violation_count INTEGER;
BEGIN
    -- Count recent violations from this IP
    SELECT COUNT(*) INTO v_violation_count
    FROM rate_limit_violations
    WHERE ip_address = p_ip_address
    AND created_at > NOW() - p_time_window;
    
    IF v_violation_count >= p_threshold THEN
        INSERT INTO rate_limit_blocklist (ip_address, reason, violation_count, expires_at, blocked_by)
        VALUES (
            p_ip_address,
            'Auto-blocked due to excessive rate limit violations',
            v_violation_count,
            NOW() + p_block_duration,
            'auto'
        )
        ON CONFLICT (ip_address) DO UPDATE SET
            violation_count = rate_limit_blocklist.violation_count + 1,
            expires_at = GREATEST(rate_limit_blocklist.expires_at, NOW() + p_block_duration);
        
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Default Rate Limit Configurations
-- ============================================================

INSERT INTO rate_limit_configs (name, endpoint_pattern, max_requests, window_seconds, burst_limit, tier, description)
VALUES
    -- Authentication endpoints (strict limits)
    ('auth_login', '/api/auth/login', 5, 60, 2, 'default', 'Login attempts per minute'),
    ('auth_signup', '/api/auth/signup', 3, 60, 1, 'default', 'Signup attempts per minute'),
    ('auth_password_reset', '/api/auth/reset', 3, 300, 1, 'default', 'Password reset attempts per 5 min'),
    
    -- AI/Claude endpoints (expensive operations)
    ('ai_generate', '/api/studio/generate', 10, 60, 3, 'starter', 'AI generation for Starter tier'),
    ('ai_generate_growth', '/api/studio/generate', 50, 60, 10, 'growth', 'AI generation for Growth tier'),
    ('ai_generate_scale', '/api/studio/generate', 200, 60, 50, 'scale', 'AI generation for Scale tier'),
    ('ai_brain', '/api/brain/*', 20, 60, 5, 'starter', 'Brain queries for Starter tier'),
    ('ai_brain_growth', '/api/brain/*', 100, 60, 20, 'growth', 'Brain queries for Growth tier'),
    ('ai_brain_scale', '/api/brain/*', 500, 60, 100, 'scale', 'Brain queries for Scale tier'),
    
    -- Mission endpoints
    ('missions_start', '/api/missions/start', 10, 60, 3, 'default', 'Mission starts per minute'),
    ('missions_respond', '/api/missions/*/respond', 30, 60, 10, 'default', 'Mission responses per minute'),
    
    -- Scraping endpoints (very restricted)
    ('scrape_request', '/api/scrape/request', 5, 3600, 2, 'default', 'Scrape requests per hour'),
    ('scrape_run', '/api/scrape/run', 2, 3600, 1, 'default', 'Scrape runs per hour'),
    
    -- Calendar/CRUD endpoints
    ('calendar_read', '/api/calendar', 100, 60, 20, 'default', 'Calendar reads per minute'),
    ('calendar_write', '/api/calendar/*', 30, 60, 10, 'default', 'Calendar writes per minute'),
    
    -- Notifications
    ('notifications', '/api/notifications', 60, 60, 15, 'default', 'Notification requests per minute'),
    
    -- General API (catch-all)
    ('api_general', '/api/*', 100, 60, 25, 'starter', 'General API for Starter tier'),
    ('api_general_growth', '/api/*', 500, 60, 100, 'growth', 'General API for Growth tier'),
    ('api_general_scale', '/api/*', 2000, 60, 500, 'scale', 'General API for Scale tier'),
    
    -- Stripe/Payment endpoints
    ('stripe_checkout', '/api/stripe/checkout', 5, 60, 2, 'default', 'Checkout attempts per minute'),
    
    -- Admin endpoints
    ('admin', '/api/admin/*', 50, 60, 10, 'default', 'Admin operations per minute')
ON CONFLICT (name) DO UPDATE SET
    endpoint_pattern = EXCLUDED.endpoint_pattern,
    max_requests = EXCLUDED.max_requests,
    window_seconds = EXCLUDED.window_seconds,
    burst_limit = EXCLUDED.burst_limit,
    tier = EXCLUDED.tier,
    description = EXCLUDED.description,
    updated_at = NOW();

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE rate_limit_entries IS 'Tracks rate limit counters per identifier/endpoint/window';
COMMENT ON TABLE rate_limit_configs IS 'Configurable rate limit rules per endpoint pattern and tier';
COMMENT ON TABLE rate_limit_violations IS 'Audit log of rate limit violations for security monitoring';
COMMENT ON TABLE rate_limit_blocklist IS 'IP blocklist for severe rate limit abusers';
COMMENT ON FUNCTION increment_rate_limit IS 'Atomically increment rate limit counter and return current count';
COMMENT ON FUNCTION is_ip_blocked IS 'Check if an IP address is currently blocked';
COMMENT ON FUNCTION auto_block_ip IS 'Automatically block IP after threshold violations';
