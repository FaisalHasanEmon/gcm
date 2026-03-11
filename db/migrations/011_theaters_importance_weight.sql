-- 011_theaters_importance_weight.sql
-- Ensures theaters.importance_weight column exists
-- (was added in Pass 1 seed but not in the canonical v5 DDL schema)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='theaters' AND column_name='importance_weight'
  ) THEN
    ALTER TABLE theaters ADD COLUMN importance_weight numeric(4,2) NOT NULL DEFAULT 1.0;
  END IF;
END $$;
