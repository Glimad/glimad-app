-- RLS policies for billing and wallet tables
-- Users can read their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON core_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- RLS for core_access_grants
ALTER TABLE core_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access grants"
  ON core_access_grants FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view own wallets (via project ownership)
CREATE POLICY "Users can view own wallets"
  ON core_wallets FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Users can view own ledger
CREATE POLICY "Users can view own ledger"
  ON core_ledger FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- RLS for onboarding_sessions
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding session"
  ON onboarding_sessions FOR SELECT
  USING (converted_to_user_id = auth.uid() OR converted_to_user_id IS NULL);
