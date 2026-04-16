-- Migration 011: Add daily_llm_limit to core_plans
-- Per-plan daily LLM call cap: starter=50, growth=150, scale=300

ALTER TABLE core_plans ADD COLUMN IF NOT EXISTS daily_llm_limit INTEGER NOT NULL DEFAULT 50;

UPDATE core_plans SET daily_llm_limit = 50  WHERE plan_code = 'starter';
UPDATE core_plans SET daily_llm_limit = 150 WHERE plan_code = 'growth';
UPDATE core_plans SET daily_llm_limit = 300 WHERE plan_code = 'scale';
