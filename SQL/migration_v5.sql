-- V5 Migration: tenant columns + PostgreSQL Row-Level Security for business tables

-- Ensure workspace registry exists for tenant isolation
CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO workspaces (name, slug)
VALUES ('Default Workspace', 'default-workspace')
ON CONFLICT (slug) DO NOTHING;

-- Add tenant discriminator columns to core business tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE;

-- Backfill existing rows into default workspace
UPDATE users SET workspace_id = w.id
FROM workspaces w
WHERE w.slug = 'default-workspace' AND users.workspace_id IS NULL;

UPDATE products SET workspace_id = w.id
FROM workspaces w
WHERE w.slug = 'default-workspace' AND products.workspace_id IS NULL;

UPDATE orders SET workspace_id = w.id
FROM workspaces w
WHERE w.slug = 'default-workspace' AND orders.workspace_id IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE users ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN workspace_id SET NOT NULL;

-- Useful indexes for tenant-scoped filtering
CREATE INDEX IF NOT EXISTS idx_users_workspace_id ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_workspace_id ON products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_orders_workspace_id ON orders(workspace_id);

-- Enable row-level security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

-- Tenant policy helper:
-- app.current_workspace_id must be set per session/query context.
-- If it is not set, policy evaluates to FALSE and returns no rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_workspace_isolation'
  ) THEN
    CREATE POLICY users_workspace_isolation
      ON users
      FOR SELECT
      USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::int);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_workspace_isolation'
  ) THEN
    CREATE POLICY products_workspace_isolation
      ON products
      FOR SELECT
      USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::int);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_workspace_isolation'
  ) THEN
    CREATE POLICY orders_workspace_isolation
      ON orders
      FOR SELECT
      USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::int);
  END IF;
END $$;
