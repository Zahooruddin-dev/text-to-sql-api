-- V3 Migration: JWT/OAuth, Audit Logs, Metrics Persistence, and Multi-tenant Support

-- Create workspace/tenant table
CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create users table for authentication
CREATE TABLE IF NOT EXISTS api_users (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  oauth_provider VARCHAR(50),
  oauth_id VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'viewer', -- admin, editor, viewer
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, email)
);

-- Create roles and permissions table
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INT REFERENCES api_users(id) ON DELETE SET NULL,
  request_id VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status_code INT,
  duration_ms INT,
  created_at TIMESTAMP DEFAULT NOW
);

-- Create indexes for audit logs
CREATE INDEX idx_audit_logs_workspace_id ON audit_logs(workspace_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);

-- Create metrics table for persistent storage
CREATE TABLE IF NOT EXISTS query_metrics (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INT REFERENCES api_users(id) ON DELETE SET NULL,
  request_id VARCHAR(100),
  query_time_ms INT,
  row_count INT,
  success BOOLEAN,
  error_message TEXT,
  sql_preview TEXT,
  endpoint VARCHAR(100),
  response_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW
);

-- Create indexes for metrics
CREATE INDEX idx_query_metrics_workspace_id ON query_metrics(workspace_id);
CREATE INDEX idx_query_metrics_user_id ON query_metrics(user_id);
CREATE INDEX idx_query_metrics_created_at ON query_metrics(created_at DESC);
CREATE INDEX idx_query_metrics_success ON query_metrics(success);

-- Create data policies table for role-based filtering
CREATE TABLE IF NOT EXISTS data_policies (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  role VARCHAR(100) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  allowed_columns TEXT[],
  row_filter_sql TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, role, table_name)
);

-- Create multi-tenant access control table
CREATE TABLE IF NOT EXISTS tenant_permissions (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INT REFERENCES api_users(id) ON DELETE CASCADE,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  permission VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, user_id, resource_type, resource_id, permission)
);

-- Create JWT tokens table for token management and revocation
CREATE TABLE IF NOT EXISTS jwt_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES api_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES api_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create query optimizer hints/statistics table
CREATE TABLE IF NOT EXISTS query_optimization_hints (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  query_pattern TEXT,
  suggested_index TEXT,
  estimated_improvement_percent INT,
  implemented BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed initial workspace
INSERT INTO workspaces (name, slug) VALUES 
  ('Default Workspace', 'default-workspace')
ON CONFLICT (slug) DO NOTHING;

-- Create indexes for performance
CREATE INDEX idx_api_users_workspace_id ON api_users(workspace_id);
CREATE INDEX idx_api_users_email ON api_users(email);
CREATE INDEX idx_roles_workspace_id ON roles(workspace_id);
CREATE INDEX idx_data_policies_workspace_id ON data_policies(workspace_id);
CREATE INDEX idx_tenant_permissions_workspace_id ON tenant_permissions(workspace_id);
CREATE INDEX idx_jwt_tokens_user_id ON jwt_tokens(user_id);
CREATE INDEX idx_jwt_tokens_expires_at ON jwt_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
