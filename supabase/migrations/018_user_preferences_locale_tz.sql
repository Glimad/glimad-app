-- Add posting_frequency, timezone, locale to user_preferences
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS posting_frequency TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT;
