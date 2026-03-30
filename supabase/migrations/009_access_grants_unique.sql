-- Migration 009: Add unique constraint on core_access_grants.reference_id
-- Required for upsert idempotency in webhook handler

ALTER TABLE core_access_grants
  ADD CONSTRAINT core_access_grants_reference_id_unique UNIQUE (reference_id);
