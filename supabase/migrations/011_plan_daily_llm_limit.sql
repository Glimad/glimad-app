-- Migration 011: Add daily_llm_limit to core_plans
-- Per-plan daily LLM call cap: BASE=50, PRO=150, ELITE=300

ALTER TABLE core_plans ADD COLUMN IF NOT EXISTS daily_llm_limit INTEGER NOT NULL DEFAULT 50;

UPDATE core_plans SET daily_llm_limit = 50  WHERE plan_code = 'BASE';
UPDATE core_plans SET daily_llm_limit = 150 WHERE plan_code = 'PRO';
UPDATE core_plans SET daily_llm_limit = 300 WHERE plan_code = 'ELITE';
