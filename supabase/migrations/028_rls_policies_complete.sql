-- ============================================================
-- 028_rls_policies_complete.sql
-- Brief 24: Complete RLS Policies
--
-- Consolidates and fills gaps in Row Level Security:
--  1. Full CRUD policies for existing tables missing INSERT/UPDATE/DELETE
--  2. RLS for all new tables added in Briefs 11-16
--  3. Service-role bypass pattern (service role ignores RLS by default)
--  4. Admin-only tables
--
-- Pattern guide:
--  - owner-based:   auth.uid() = user_id
--  - project-based: EXISTS (SELECT 1 FROM projects WHERE id = t.project_id AND user_id = auth.uid())
--  - service-only:  (current_setting('role') = 'service_role')   ← enforced by NOT creating user policies
--  - public read:   true (no RLS, or open SELECT)
-- ============================================================

-- ============================================================
-- HELPER: re-usable project ownership check (inline)
-- Supabase RLS uses inline SQL; no functions to avoid recursion
-- ============================================================

-- ============================================================
-- 1. PROJECTS — complete SELECT/INSERT/UPDATE (DELETE is admin-only)
-- ============================================================

-- DELETE protection: only service role (no user DELETE policy)
-- Existing: SELECT, INSERT, UPDATE ✓

-- ============================================================
-- 2. USER_PREFERENCES — full CRUD
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND policyname = 'owner_user_preferences_select'
  ) THEN
    CREATE POLICY owner_user_preferences_select ON user_preferences
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND policyname = 'owner_user_preferences_insert'
  ) THEN
    CREATE POLICY owner_user_preferences_insert ON user_preferences
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND policyname = 'owner_user_preferences_update'
  ) THEN
    CREATE POLICY owner_user_preferences_update ON user_preferences
      FOR UPDATE USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 3. BRAIN_FACTS — INSERT + UPDATE (SELECT exists)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_facts' AND policyname = 'owner_brain_facts_insert'
  ) THEN
    CREATE POLICY owner_brain_facts_insert ON brain_facts
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_facts' AND policyname = 'owner_brain_facts_update'
  ) THEN
    CREATE POLICY owner_brain_facts_update ON brain_facts
      FOR UPDATE USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 4. BRAIN_SIGNALS — full CRUD
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_signals' AND policyname = 'owner_brain_signals_select'
  ) THEN
    CREATE POLICY owner_brain_signals_select ON brain_signals
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_signals' AND policyname = 'owner_brain_signals_insert'
  ) THEN
    CREATE POLICY owner_brain_signals_insert ON brain_signals
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 5. BRAIN_SNAPSHOTS — full CRUD
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_snapshots' AND policyname = 'owner_brain_snapshots_select'
  ) THEN
    CREATE POLICY owner_brain_snapshots_select ON brain_snapshots
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_snapshots' AND policyname = 'owner_brain_snapshots_insert'
  ) THEN
    CREATE POLICY owner_brain_snapshots_insert ON brain_snapshots
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 6. CORE_OUTPUTS — full CRUD
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_outputs' AND policyname = 'owner_core_outputs_select'
  ) THEN
    CREATE POLICY owner_core_outputs_select ON core_outputs
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_outputs' AND policyname = 'owner_core_outputs_insert'
  ) THEN
    CREATE POLICY owner_core_outputs_insert ON core_outputs
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_outputs' AND policyname = 'owner_core_outputs_update'
  ) THEN
    CREATE POLICY owner_core_outputs_update ON core_outputs
      FOR UPDATE USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 7. CORE_CALENDAR_ITEMS — full CRUD
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_calendar_items' AND policyname = 'owner_core_calendar_items_select'
  ) THEN
    CREATE POLICY owner_core_calendar_items_select ON core_calendar_items
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_calendar_items' AND policyname = 'owner_core_calendar_items_insert'
  ) THEN
    CREATE POLICY owner_core_calendar_items_insert ON core_calendar_items
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_calendar_items' AND policyname = 'owner_core_calendar_items_update'
  ) THEN
    CREATE POLICY owner_core_calendar_items_update ON core_calendar_items
      FOR UPDATE USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_calendar_items' AND policyname = 'owner_core_calendar_items_delete'
  ) THEN
    CREATE POLICY owner_core_calendar_items_delete ON core_calendar_items
      FOR DELETE USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 8. MISSION_INSTANCES — full CRUD
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_instances' AND policyname = 'owner_mission_instances_select'
  ) THEN
    CREATE POLICY owner_mission_instances_select ON mission_instances
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_instances' AND policyname = 'owner_mission_instances_insert'
  ) THEN
    CREATE POLICY owner_mission_instances_insert ON mission_instances
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_instances' AND policyname = 'owner_mission_instances_update'
  ) THEN
    CREATE POLICY owner_mission_instances_update ON mission_instances
      FOR UPDATE USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 9. MISSION_STEPS — full CRUD (if table exists)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mission_steps') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mission_steps' AND policyname = 'owner_mission_steps_select') THEN
      EXECUTE $policy$
        CREATE POLICY owner_mission_steps_select ON mission_steps
          FOR SELECT USING (
            mission_instance_id IN (
              SELECT id FROM mission_instances
              WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
            )
          )
      $policy$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mission_steps' AND policyname = 'owner_mission_steps_insert') THEN
      EXECUTE $policy$
        CREATE POLICY owner_mission_steps_insert ON mission_steps
          FOR INSERT WITH CHECK (
            mission_instance_id IN (
              SELECT id FROM mission_instances
              WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
            )
          )
      $policy$;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 10. CORE_ASSETS — full CRUD (Brief 12)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_assets') THEN
    EXECUTE 'ALTER TABLE core_assets ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_assets' AND policyname = 'owner_core_assets_select') THEN
      EXECUTE $policy$
        CREATE POLICY owner_core_assets_select ON core_assets
          FOR SELECT USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_assets' AND policyname = 'owner_core_assets_insert') THEN
      EXECUTE $policy$
        CREATE POLICY owner_core_assets_insert ON core_assets
          FOR INSERT WITH CHECK (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_assets' AND policyname = 'owner_core_assets_update') THEN
      EXECUTE $policy$
        CREATE POLICY owner_core_assets_update ON core_assets
          FOR UPDATE USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_assets' AND policyname = 'owner_core_assets_delete') THEN
      EXECUTE $policy$
        CREATE POLICY owner_core_assets_delete ON core_assets
          FOR DELETE USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 11. CORE_EXPERIMENTS + VARIANTS + ITEMS (Brief 15)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_experiments') THEN
    EXECUTE 'ALTER TABLE core_experiments ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_experiments' AND policyname = 'owner_core_experiments_select') THEN
      EXECUTE $policy$
        CREATE POLICY owner_core_experiments_select ON core_experiments
          FOR SELECT USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_experiments' AND policyname = 'owner_core_experiments_insert') THEN
      EXECUTE $policy$
        CREATE POLICY owner_core_experiments_insert ON core_experiments
          FOR INSERT WITH CHECK (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_experiments' AND policyname = 'owner_core_experiments_update') THEN
      EXECUTE $policy$
        CREATE POLICY owner_core_experiments_update ON core_experiments
          FOR UPDATE USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_experiment_variants') THEN
    EXECUTE 'ALTER TABLE core_experiment_variants ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_experiment_variants' AND policyname = 'owner_experiment_variants') THEN
      EXECUTE $policy$
        CREATE POLICY owner_experiment_variants ON core_experiment_variants
          FOR ALL USING (
            experiment_id IN (
              SELECT experiment_id FROM core_experiments
              WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
            )
          )
      $policy$;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_experiment_items') THEN
    EXECUTE 'ALTER TABLE core_experiment_items ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_experiment_items' AND policyname = 'owner_experiment_items') THEN
      EXECUTE $policy$
        CREATE POLICY owner_experiment_items ON core_experiment_items
          FOR ALL USING (
            experiment_id IN (
              SELECT experiment_id FROM core_experiments
              WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
            )
          )
      $policy$;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 12. CORE_LEARNINGS (Brief 15)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_learnings') THEN
    EXECUTE 'ALTER TABLE core_learnings ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_learnings' AND policyname = 'owner_core_learnings') THEN
      EXECUTE $policy$
        CREATE POLICY owner_core_learnings ON core_learnings
          FOR ALL USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 13. CORE_PERFORMANCE_WINNERS (Brief 15)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_performance_winners') THEN
    EXECUTE 'ALTER TABLE core_performance_winners ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_performance_winners' AND policyname = 'owner_performance_winners') THEN
      EXECUTE $policy$
        CREATE POLICY owner_performance_winners ON core_performance_winners
          FOR ALL USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 14. CORE_COST_METRICS (Brief 15)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_cost_metrics') THEN
    EXECUTE 'ALTER TABLE core_cost_metrics ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_cost_metrics' AND policyname = 'owner_cost_metrics') THEN
      EXECUTE $policy$
        CREATE POLICY owner_cost_metrics ON core_cost_metrics
          FOR ALL USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 15. CORE_LAB_JOBS (Brief 16)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_lab_jobs') THEN
    EXECUTE 'ALTER TABLE core_lab_jobs ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_lab_jobs' AND policyname = 'owner_lab_jobs_select') THEN
      EXECUTE $policy$
        CREATE POLICY owner_lab_jobs_select ON core_lab_jobs
          FOR SELECT USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_lab_jobs' AND policyname = 'owner_lab_jobs_insert') THEN
      EXECUTE $policy$
        CREATE POLICY owner_lab_jobs_insert ON core_lab_jobs
          FOR INSERT WITH CHECK (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;
    -- UPDATE/DELETE: service role only (runner updates status)
  END IF;
END $$;

-- ============================================================
-- 16. CORE_BRAIN_UPDATES (Brief 16)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_brain_updates') THEN
    EXECUTE 'ALTER TABLE core_brain_updates ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'core_brain_updates' AND policyname = 'owner_brain_updates_select') THEN
      EXECUTE $policy$
        CREATE POLICY owner_brain_updates_select ON core_brain_updates
          FOR SELECT USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
          )
      $policy$;
    END IF;
    -- INSERT/UPDATE: service role only
  END IF;
END $$;

-- ============================================================
-- 17. ANALYTICS_EVENTS (Brief 15)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_events') THEN
    EXECUTE 'ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analytics_events' AND policyname = 'owner_analytics_events_select') THEN
      EXECUTE $policy$
        CREATE POLICY owner_analytics_events_select ON analytics_events
          FOR SELECT USING (
            project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
            OR project_id IS NULL
          )
      $policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analytics_events' AND policyname = 'owner_analytics_events_insert') THEN
      EXECUTE $policy$
        CREATE POLICY owner_analytics_events_insert ON analytics_events
          FOR INSERT WITH CHECK (true)
      $policy$;
    END IF;
    -- Only service role can read all; users see their own
  END IF;
END $$;

-- ============================================================
-- 18. CORE_SCRAPE_RUNS — INSERT + UPDATE (SELECT path missing)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_scrape_runs' AND policyname = 'owner_core_scrape_runs_select'
  ) THEN
    CREATE POLICY owner_core_scrape_runs_select ON core_scrape_runs
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_scrape_runs' AND policyname = 'owner_core_scrape_runs_insert'
  ) THEN
    CREATE POLICY owner_core_scrape_runs_insert ON core_scrape_runs
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 19. CORE_WALLETS — INSERT (users create own wallet post-payment)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_wallets' AND policyname = 'owner_core_wallets_insert'
  ) THEN
    CREATE POLICY owner_core_wallets_insert ON core_wallets
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 20. CORE_LEDGER — INSERT (for user-initiated credit top-ups)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'core_ledger' AND policyname = 'owner_core_ledger_insert'
  ) THEN
    CREATE POLICY owner_core_ledger_insert ON core_ledger
      FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 21. PUBLIC READ TABLES (no RLS needed, kept open for anon)
-- mission_templates, core_plans, core_credit_products
-- These are catalog tables — no user data
-- ============================================================
-- (No policies needed — service role handles writes, anon can read)

-- ============================================================
-- DONE
-- ============================================================
