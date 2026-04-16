-- ============================================================
-- GDPR Compliance Infrastructure
-- Implements data privacy controls, consent management, and right to be forgotten
-- ============================================================

-- ============================================================
-- 1. CONSENT MANAGEMENT
-- ============================================================

-- User consent records for different data processing purposes
CREATE TABLE IF NOT EXISTS gdpr_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Consent types (GDPR requires explicit opt-in)
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'essential',           -- Required for service operation
    'analytics',           -- Usage analytics and improvements
    'marketing',           -- Marketing communications
    'third_party',         -- Third-party integrations
    'ai_processing',       -- AI/ML data processing
    'profiling',           -- User profiling and personalization
    'social_scraping',     -- Social media data collection
    'data_retention'       -- Extended data retention
  )),
  
  -- Consent status
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  
  -- Consent metadata
  consent_version TEXT NOT NULL DEFAULT '1.0',
  ip_address INET,
  user_agent TEXT,
  consent_source TEXT CHECK (consent_source IN (
    'signup', 'settings', 'banner', 'api', 'admin'
  )) NOT NULL DEFAULT 'signup',
  
  -- Legal basis (GDPR Article 6)
  legal_basis TEXT CHECK (legal_basis IN (
    'consent',             -- User gave explicit consent
    'contract',            -- Necessary for contract performance
    'legal_obligation',    -- Required by law
    'vital_interests',     -- Protect vital interests
    'public_task',         -- Public interest
    'legitimate_interest'  -- Legitimate business interest
  )) NOT NULL DEFAULT 'consent',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, consent_type)
);

CREATE INDEX idx_gdpr_consents_user_id ON gdpr_consents(user_id);
CREATE INDEX idx_gdpr_consents_type ON gdpr_consents(consent_type);
CREATE INDEX idx_gdpr_consents_granted ON gdpr_consents(granted) WHERE granted = true;

-- ============================================================
-- 2. DATA ACCESS REQUESTS (Subject Access Requests - SAR)
-- ============================================================

CREATE TABLE IF NOT EXISTS gdpr_data_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Request type
  request_type TEXT NOT NULL CHECK (request_type IN (
    'export',              -- Right to access (Art. 15)
    'delete',              -- Right to erasure (Art. 17)
    'rectify',             -- Right to rectification (Art. 16)
    'restrict',            -- Right to restrict processing (Art. 18)
    'portability',         -- Right to data portability (Art. 20)
    'objection'            -- Right to object (Art. 21)
  )),
  
  -- Request status
  status TEXT NOT NULL CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
  )) DEFAULT 'pending',
  
  -- Request details
  reason TEXT,
  scope TEXT[] DEFAULT ARRAY['all'], -- Which data categories
  
  -- Processing info
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  processing_notes TEXT,
  
  -- For export requests
  export_url TEXT,
  export_expires_at TIMESTAMPTZ,
  export_format TEXT CHECK (export_format IN ('json', 'csv', 'zip')),
  
  -- For delete requests
  deletion_confirmed BOOLEAN DEFAULT false,
  data_categories_deleted TEXT[],
  
  -- Verification
  verified BOOLEAN DEFAULT false,
  verification_method TEXT,
  verified_at TIMESTAMPTZ,
  
  -- GDPR requires response within 30 days
  deadline_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_data_requests_user_id ON gdpr_data_requests(user_id);
CREATE INDEX idx_gdpr_data_requests_status ON gdpr_data_requests(status);
CREATE INDEX idx_gdpr_data_requests_deadline ON gdpr_data_requests(deadline_at) WHERE status = 'pending';
CREATE INDEX idx_gdpr_data_requests_type ON gdpr_data_requests(request_type);

-- ============================================================
-- 3. DATA PROCESSING AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS gdpr_processing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- What data was processed
  data_category TEXT NOT NULL CHECK (data_category IN (
    'identity',            -- Name, email, etc.
    'contact',             -- Phone, address
    'financial',           -- Payment info, subscriptions
    'behavioral',          -- Usage patterns, preferences
    'content',             -- User-generated content
    'social',              -- Social media data
    'technical',           -- IP, device info
    'ai_derived',          -- AI-generated insights
    'communications'       -- Emails, notifications
  )),
  
  -- Processing activity
  processing_activity TEXT NOT NULL CHECK (processing_activity IN (
    'collect',
    'store',
    'process',
    'analyze',
    'share',
    'export',
    'delete',
    'anonymize'
  )),
  
  -- Processing details
  purpose TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  data_processor TEXT, -- Third party if applicable
  recipient TEXT,      -- Who received the data
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  
  -- Retention
  retention_period INTERVAL,
  scheduled_deletion_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_processing_log_user_id ON gdpr_processing_log(user_id);
CREATE INDEX idx_gdpr_processing_log_category ON gdpr_processing_log(data_category);
CREATE INDEX idx_gdpr_processing_log_activity ON gdpr_processing_log(processing_activity);
CREATE INDEX idx_gdpr_processing_log_created_at ON gdpr_processing_log(created_at DESC);

-- ============================================================
-- 4. DATA RETENTION POLICIES
-- ============================================================

CREATE TABLE IF NOT EXISTS gdpr_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What this policy applies to
  data_category TEXT NOT NULL UNIQUE,
  table_name TEXT NOT NULL,
  
  -- Retention rules
  retention_period INTERVAL NOT NULL,
  retention_basis TEXT NOT NULL, -- Legal reason for retention
  
  -- Deletion behavior
  deletion_type TEXT CHECK (deletion_type IN (
    'hard_delete',        -- Permanently remove
    'soft_delete',        -- Mark as deleted
    'anonymize',          -- Remove PII but keep data
    'archive'             -- Move to cold storage
  )) NOT NULL DEFAULT 'hard_delete',
  
  -- Automation
  auto_delete BOOLEAN DEFAULT false,
  last_cleanup_at TIMESTAMPTZ,
  next_cleanup_at TIMESTAMPTZ,
  
  -- Policy metadata
  policy_version TEXT NOT NULL DEFAULT '1.0',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default retention policies
INSERT INTO gdpr_retention_policies (data_category, table_name, retention_period, retention_basis, deletion_type, auto_delete)
VALUES
  ('user_accounts', 'auth.users', '3 years', 'Contract performance + legal requirements', 'hard_delete', false),
  ('onboarding_sessions', 'onboarding_sessions', '1 year', 'Analytics and improvement', 'anonymize', true),
  ('projects', 'projects', '3 years', 'Contract performance', 'archive', false),
  ('brain_data', 'brain_facts', '2 years', 'Service operation', 'anonymize', true),
  ('scrape_data', 'core_scrape_runs', '1 year', 'Service operation', 'hard_delete', true),
  ('payment_records', 'core_payments', '7 years', 'Legal tax requirements', 'archive', false),
  ('event_logs', 'core_event_log', '90 days', 'Security and debugging', 'hard_delete', true),
  ('notifications', 'notifications', '6 months', 'Service operation', 'hard_delete', true),
  ('missions', 'mission_instances', '2 years', 'Contract performance', 'archive', false),
  ('calendar_items', 'core_calendar_items', '2 years', 'Contract performance', 'archive', false)
ON CONFLICT (data_category) DO NOTHING;

-- ============================================================
-- 5. ANONYMIZATION TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS gdpr_anonymization_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was anonymized
  original_user_id UUID, -- Kept for audit, user may be deleted
  table_name TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  
  -- Anonymization details
  anonymization_method TEXT CHECK (anonymization_method IN (
    'hash',               -- SHA256 hash
    'pseudonymize',       -- Replace with pseudonym
    'generalize',         -- Make less specific
    'suppress',           -- Remove entirely
    'noise_addition',     -- Add random noise
    'data_masking'        -- Partial masking
  )) NOT NULL,
  
  fields_anonymized TEXT[] NOT NULL,
  
  -- Verification
  verified_complete BOOLEAN DEFAULT false,
  verification_method TEXT,
  
  -- Request reference
  data_request_id UUID REFERENCES gdpr_data_requests(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_anonymization_log_user_id ON gdpr_anonymization_log(original_user_id);
CREATE INDEX idx_gdpr_anonymization_log_created_at ON gdpr_anonymization_log(created_at DESC);

-- ============================================================
-- 6. THIRD-PARTY DATA SHARING LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS gdpr_data_sharing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Recipient info
  recipient_name TEXT NOT NULL,
  recipient_type TEXT CHECK (recipient_type IN (
    'processor',          -- Data processor
    'controller',         -- Data controller
    'authority',          -- Government/regulator
    'user_request'        -- Shared at user's request
  )) NOT NULL,
  recipient_country TEXT,
  
  -- What was shared
  data_categories TEXT[] NOT NULL,
  purpose TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  
  -- Data protection
  safeguards TEXT, -- e.g., "Standard Contractual Clauses"
  dpa_in_place BOOLEAN DEFAULT false, -- Data Processing Agreement
  
  -- Transfer details
  transfer_method TEXT,
  encryption_used BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_data_sharing_log_user_id ON gdpr_data_sharing_log(user_id);
CREATE INDEX idx_gdpr_data_sharing_log_recipient ON gdpr_data_sharing_log(recipient_name);

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE gdpr_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_processing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_anonymization_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_data_sharing_log ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own consents
CREATE POLICY "Users can view own consents" ON gdpr_consents
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own consents" ON gdpr_consents
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consents" ON gdpr_consents
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can view and create their own data requests
CREATE POLICY "Users can view own data requests" ON gdpr_data_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own data requests" ON gdpr_data_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can view their own processing log
CREATE POLICY "Users can view own processing log" ON gdpr_processing_log
  FOR SELECT USING (user_id = auth.uid());

-- Users can view their own data sharing log
CREATE POLICY "Users can view own data sharing log" ON gdpr_data_sharing_log
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================

-- Function to check if user has given specific consent
CREATE OR REPLACE FUNCTION has_gdpr_consent(
  p_user_id UUID,
  p_consent_type TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM gdpr_consents
    WHERE user_id = p_user_id
      AND consent_type = p_consent_type
      AND granted = true
      AND revoked_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log GDPR processing activity
CREATE OR REPLACE FUNCTION log_gdpr_processing(
  p_user_id UUID,
  p_data_category TEXT,
  p_activity TEXT,
  p_purpose TEXT,
  p_legal_basis TEXT,
  p_processor TEXT DEFAULT NULL,
  p_recipient TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO gdpr_processing_log (
    user_id, data_category, processing_activity,
    purpose, legal_basis, data_processor, recipient
  ) VALUES (
    p_user_id, p_data_category, p_activity,
    p_purpose, p_legal_basis, p_processor, p_recipient
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's data for export
CREATE OR REPLACE FUNCTION get_user_data_export(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'export_date', NOW(),
    'user_id', p_user_id,
    'projects', (
      SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
      FROM projects p WHERE p.user_id = p_user_id
    ),
    'preferences', (
      SELECT COALESCE(jsonb_agg(row_to_json(up)), '[]'::jsonb)
      FROM user_preferences up
      JOIN projects p ON up.project_id = p.id
      WHERE p.user_id = p_user_id
    ),
    'brain_facts', (
      SELECT COALESCE(jsonb_agg(row_to_json(bf)), '[]'::jsonb)
      FROM brain_facts bf
      JOIN projects p ON bf.project_id = p.id
      WHERE p.user_id = p_user_id
    ),
    'missions', (
      SELECT COALESCE(jsonb_agg(row_to_json(mi)), '[]'::jsonb)
      FROM mission_instances mi
      JOIN projects p ON mi.project_id = p.id
      WHERE p.user_id = p_user_id
    ),
    'consents', (
      SELECT COALESCE(jsonb_agg(row_to_json(gc)), '[]'::jsonb)
      FROM gdpr_consents gc WHERE gc.user_id = p_user_id
    ),
    'subscriptions', (
      SELECT COALESCE(jsonb_agg(row_to_json(cs)), '[]'::jsonb)
      FROM core_subscriptions cs WHERE cs.user_id = p_user_id
    ),
    'onboarding', (
      SELECT COALESCE(jsonb_agg(row_to_json(os)), '[]'::jsonb)
      FROM onboarding_sessions os WHERE os.converted_to_user_id = p_user_id
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
