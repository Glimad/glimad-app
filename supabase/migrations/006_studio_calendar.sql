ALTER TABLE core_assets
  DROP CONSTRAINT IF EXISTS core_assets_asset_type_check,
  ALTER COLUMN asset_type DROP NOT NULL,
  ALTER COLUMN file_url DROP NOT NULL;

ALTER TABLE core_assets
  ADD COLUMN IF NOT EXISTS content JSONB,
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE core_assets
  ADD CONSTRAINT core_assets_asset_type_check
    CHECK (asset_type IN ('image', 'video', 'audio', 'document', 'content_piece'));

ALTER TABLE core_calendar_items
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES core_assets(id),
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT CHECK (state IN ('draft', 'scheduled', 'published', 'failed', 'paused')) NOT NULL DEFAULT 'draft',
  ALTER COLUMN platform DROP NOT NULL,
  ALTER COLUMN scheduled_at DROP NOT NULL;

INSERT INTO core_ledger_reasons (reason_key, description, type)
VALUES ('LLM_CALL_STUDIO', 'LLM call from Content Studio', 'allowance')
ON CONFLICT (reason_key) DO NOTHING;
