-- ============================================================
-- Migration: Backup & Disaster Recovery Infrastructure
-- Brief 33: Backup Strategy, RPO/RTO Targets, Recovery Playbooks
-- ============================================================

-- ============================================================
-- Backup Log Table
-- ============================================================

CREATE TABLE IF NOT EXISTS backup_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_type TEXT NOT NULL,              -- 'full', 'incremental', 'table', 'pitr'
    target TEXT NOT NULL,                   -- 'database', 'storage', 'n8n', 'secrets'
    tables TEXT[],                          -- Tables included (for table-specific backups)
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
    size_bytes BIGINT,                      -- Backup file size
    location TEXT,                          -- S3 URI or local path
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',            -- Additional backup details
    created_by TEXT DEFAULT 'system',       -- 'system', 'admin', 'cron'
    verified_at TIMESTAMPTZ,                -- When backup was tested
    verified_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Restoration Log Table
-- ============================================================

CREATE TABLE IF NOT EXISTS restoration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID REFERENCES backup_log(id),
    restoration_type TEXT NOT NULL,         -- 'full', 'table', 'pitr'
    target_tables TEXT[],                   -- Tables restored
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
    rows_restored BIGINT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    initiated_by TEXT NOT NULL,             -- User or system that triggered
    reason TEXT,                            -- Why restoration was needed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RPO/RTO Configuration Table
-- ============================================================

CREATE TABLE IF NOT EXISTS rpo_rto_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_type TEXT NOT NULL UNIQUE,         -- 'ledger', 'wallet', 'user', 'project', etc.
    rpo_hours DECIMAL NOT NULL,             -- Recovery Point Objective in hours
    rto_hours DECIMAL NOT NULL,             -- Recovery Time Objective in hours
    priority TEXT NOT NULL,                 -- 'P0', 'P1', 'P2', 'P3'
    backup_frequency_hours DECIMAL NOT NULL,
    retention_days INTEGER NOT NULL,
    critical BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Maintenance Mode Table
-- ============================================================

CREATE TABLE IF NOT EXISTS maintenance_mode (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT,
    message TEXT,                           -- Message to show users
    started_at TIMESTAMPTZ,
    expected_end_at TIMESTAMPTZ,
    enabled_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert single row for maintenance mode state
INSERT INTO maintenance_mode (id, enabled, reason, message)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    FALSE,
    NULL,
    NULL
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_backup_log_status 
    ON backup_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backup_log_type 
    ON backup_log(backup_type, target);

CREATE INDEX IF NOT EXISTS idx_backup_log_created 
    ON backup_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_restoration_log_backup 
    ON restoration_log(backup_id);

CREATE INDEX IF NOT EXISTS idx_restoration_log_status 
    ON restoration_log(status, created_at DESC);

-- ============================================================
-- Seed RPO/RTO Targets
-- ============================================================

INSERT INTO rpo_rto_targets (data_type, rpo_hours, rto_hours, priority, backup_frequency_hours, retention_days, critical, description)
VALUES
    ('ledger', 0, 2, 'P0', 1, 365, TRUE, 'Financial transactions - zero data loss'),
    ('wallet', 0, 2, 'P0', 1, 365, TRUE, 'User balances - derived from ledger'),
    ('user', 1, 4, 'P0', 6, 90, TRUE, 'User authentication and profile'),
    ('project', 1, 4, 'P0', 6, 90, TRUE, 'Core project entity'),
    ('subscription', 1, 4, 'P0', 6, 90, TRUE, 'Billing subscriptions'),
    ('brain_facts', 1, 6, 'P1', 6, 60, FALSE, 'User knowledge base - regenerable'),
    ('brain_signals', 1, 6, 'P1', 6, 30, FALSE, 'Behavioral signals'),
    ('brain_snapshots', 1, 6, 'P1', 6, 30, FALSE, 'Brain state snapshots'),
    ('mission_instances', 1, 6, 'P1', 6, 30, FALSE, 'Mission progress - can retry'),
    ('calendar', 4, 8, 'P2', 12, 30, FALSE, 'Content calendar - recreatable'),
    ('scrape_data', 24, 12, 'P2', 24, 14, FALSE, 'Social media scrapes - re-scrapeable'),
    ('event_log', 24, 24, 'P3', 24, 7, FALSE, 'Analytics events - historical only'),
    ('secrets', 0, 1, 'P0', 0, 0, TRUE, 'Configuration secrets - external backup')
ON CONFLICT (data_type) DO UPDATE SET
    rpo_hours = EXCLUDED.rpo_hours,
    rto_hours = EXCLUDED.rto_hours,
    priority = EXCLUDED.priority,
    backup_frequency_hours = EXCLUDED.backup_frequency_hours,
    retention_days = EXCLUDED.retention_days,
    critical = EXCLUDED.critical,
    description = EXCLUDED.description,
    updated_at = NOW();

-- ============================================================
-- Helper Functions
-- ============================================================

-- Log a backup start
CREATE OR REPLACE FUNCTION start_backup(
    p_backup_type TEXT,
    p_target TEXT,
    p_tables TEXT[] DEFAULT NULL,
    p_created_by TEXT DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO backup_log (backup_type, target, tables, status, created_by)
    VALUES (p_backup_type, p_target, p_tables, 'in_progress', p_created_by)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Complete a backup
CREATE OR REPLACE FUNCTION complete_backup(
    p_backup_id UUID,
    p_status TEXT,
    p_size_bytes BIGINT DEFAULT NULL,
    p_location TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE backup_log
    SET 
        status = p_status,
        size_bytes = p_size_bytes,
        location = p_location,
        completed_at = NOW(),
        error_message = p_error_message
    WHERE id = p_backup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if backup is overdue
CREATE OR REPLACE FUNCTION check_backup_overdue()
RETURNS TABLE(
    data_type TEXT,
    last_backup TIMESTAMPTZ,
    hours_since_backup DECIMAL,
    expected_frequency_hours DECIMAL,
    is_overdue BOOLEAN,
    priority TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rrt.data_type,
        MAX(bl.completed_at) as last_backup,
        EXTRACT(EPOCH FROM (NOW() - MAX(bl.completed_at))) / 3600 as hours_since_backup,
        rrt.backup_frequency_hours as expected_frequency_hours,
        COALESCE(
            EXTRACT(EPOCH FROM (NOW() - MAX(bl.completed_at))) / 3600 > rrt.backup_frequency_hours * 1.5,
            TRUE
        ) as is_overdue,
        rrt.priority
    FROM rpo_rto_targets rrt
    LEFT JOIN backup_log bl ON bl.target = rrt.data_type AND bl.status = 'completed'
    WHERE rrt.backup_frequency_hours > 0
    GROUP BY rrt.data_type, rrt.backup_frequency_hours, rrt.priority
    ORDER BY rrt.priority, is_overdue DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get maintenance mode status
CREATE OR REPLACE FUNCTION get_maintenance_mode()
RETURNS TABLE(
    enabled BOOLEAN,
    reason TEXT,
    message TEXT,
    started_at TIMESTAMPTZ,
    expected_end_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mm.enabled,
        mm.reason,
        mm.message,
        mm.started_at,
        mm.expected_end_at
    FROM maintenance_mode mm
    WHERE mm.id = '00000000-0000-0000-0000-000000000001';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set maintenance mode
CREATE OR REPLACE FUNCTION set_maintenance_mode(
    p_enabled BOOLEAN,
    p_reason TEXT DEFAULT NULL,
    p_message TEXT DEFAULT NULL,
    p_expected_end_at TIMESTAMPTZ DEFAULT NULL,
    p_enabled_by TEXT DEFAULT 'system'
)
RETURNS VOID AS $$
BEGIN
    UPDATE maintenance_mode
    SET 
        enabled = p_enabled,
        reason = p_reason,
        message = p_message,
        started_at = CASE WHEN p_enabled THEN NOW() ELSE NULL END,
        expected_end_at = p_expected_end_at,
        enabled_by = p_enabled_by,
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000001';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Database size info
CREATE OR REPLACE FUNCTION get_database_size_info()
RETURNS TABLE(
    total_size TEXT,
    total_bytes BIGINT,
    table_name TEXT,
    table_size TEXT,
    row_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pg_size_pretty(pg_database_size(current_database())) as total_size,
        pg_database_size(current_database()) as total_bytes,
        t.tablename::TEXT as table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.schemaname) || '.' || quote_ident(t.tablename))) as table_size,
        (SELECT reltuples::BIGINT FROM pg_class WHERE oid = (quote_ident(t.schemaname) || '.' || quote_ident(t.tablename))::regclass) as row_count
    FROM pg_tables t
    WHERE t.schemaname = 'public'
    ORDER BY pg_total_relation_size(quote_ident(t.schemaname) || '.' || quote_ident(t.tablename)) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE backup_log IS 'Tracks all backup operations with status and verification';
COMMENT ON TABLE restoration_log IS 'Tracks database restoration operations';
COMMENT ON TABLE rpo_rto_targets IS 'RPO/RTO targets per data type for disaster recovery planning';
COMMENT ON TABLE maintenance_mode IS 'Single-row table for maintenance mode state';
COMMENT ON FUNCTION start_backup IS 'Create a backup log entry at start of backup';
COMMENT ON FUNCTION complete_backup IS 'Update backup log entry on completion';
COMMENT ON FUNCTION check_backup_overdue IS 'Check which data types have overdue backups';
COMMENT ON FUNCTION get_maintenance_mode IS 'Get current maintenance mode status';
COMMENT ON FUNCTION set_maintenance_mode IS 'Enable/disable maintenance mode';
COMMENT ON FUNCTION get_database_size_info IS 'Get database and table size information';
