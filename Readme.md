# Text to SQL API V4

Production-ready Node.js API that translates natural language to safe SQL using AWS Bedrock with **JWT/OAuth authentication**, **role-based access control**, **persistent audit logs**, **query optimization** features, **provider-adapter LLM integration**, and **multi-tenant support**.

## What's New in V4

✨ **Authentication & Authorization** - JWT/OAuth replaces shared API keys with industry-standard tokens and role-based access control (admin, editor, viewer roles)

📊 **Audit & Compliance** - Persistent audit logs track all requests, user actions, and response codes for compliance and debugging

📈 **Metrics Persistence** - Query performance metrics stored long-term for trend analysis and operational intelligence

🚀 **Query Optimization** - EXPLAIN endpoint reveals execution plans, automatic index/query optimization suggestions tracked

📑 **Pagination & Versioning** - Result pagination (limit/offset), response schema versioning for backward compatibility

🏢 **Multi-tenant** - Complete workspace isolation with per-tenant data policies and row/column-level access control

🧠 **LLM Provider Adapter** - Controllers now call a provider adapter layer, enabling provider expansion while keeping request flow stable

🛡️ **Bedrock Outbound Rate Limiting** - Internal Bedrock request limiter controls burst traffic to model endpoints with retry/timeout protection

🗃️ **Read/Write DB Separation** - Read paths and write paths are separated to support least-privilege database credentials in production

🔐 **AST-based Policy Enforcement** - Data policies are now applied via SQL AST rewriting rather than string replacement

## Why this project exists

This service is designed for teams that want to offer natural-language analytics without giving direct SQL access to end users.

Primary goals:

- Convert user questions to SQL
- Keep execution read-only and bounded
- Expose preview and execute modes for safer workflows
- Support real-world operations with metrics, rate limits, and CI

## Core Features

### Query Processing
- Bedrock-powered SQL generation from natural language
- SQL preview endpoint (generate and validate only)
- SQL execute endpoint (generate, validate, run)
- One-shot SQL auto-repair when first generation fails
- Dynamic schema introspection with intelligent caching
- Strict SQL AST validation (SELECT-only, LIMIT enforcement, table allowlisting)

### Security & Access Control  
- JWT/OAuth authentication (replaces API keys)
- Role-Based Access Control (RBAC) - Admin, Editor, Viewer roles
- Row-level and column-level data policies per role
- Complete audit logging for compliance
- Query timeout and request size limits
- Read-only query type enforcement

### Operations & Intelligence
- Persistent metrics storage (query time, success rate, row counts)
- Complete audit trail (all requests logged with user attribution)
- Query EXPLAIN endpoint for performance debugging
- Automatic optimization hints and recommendations
- Multi-tenant workspace support with isolation
- Health checks and operational dashboards

## API Versioning

| Version | Base Path | Auth | Status | Next |
|---------|-----------|------|--------|------|
| **V4** | `/api/v4` | JWT/OAuth | ✅ Current | / |
| **V3** | `/api/v3` | JWT/OAuth | ⚠️ Supported | V4 |
| **V2** | `/api/v2` | API Key | ⚠️ Supported | V4 |
| **V1** | `/api/v1` | API Key | 🚫 Deprecated | Sunset 2026-12-31 |

## Architecture

### Request Flow (V4)

1. Client sends JWT token with question
2. JWT verification and workspace/role resolution
3. Schema metadata lookup (cached)
4. LLM adapter routes request to Bedrock with timeout/retry/rate limiting
5. SQL validation against AST rules
6. Data policy application based on user role
7. Query execution with timeout protection
8. Response formatting with schema version
9. Audit log recording
10. Metrics persistence

### Database Changes for V4

New tables added:
- `workspaces` - Tenant management
- `api_users` - User authentication
- `roles` - Role definitions and permissions  
- `audit_logs` - Complete request audit trail
- `query_metrics` - Persistent performance data
- `data_policies` - Role-based data access policies
- `tenant_permissions` - Fine-grained access control
- `jwt_tokens` - Token management and revocation
- `query_optimization_hints` - Optimization recommendations

## Project Structure

```
text-to-sql-api/
├── server.js                          # Express app V1/V2/V3/V4 routing
├── package.json                       # v4-compatible API runtime
├── SQL/
│   ├── table.sql                      # Base schema (users, products, orders)
│   └── migration_v3.sql               # V3 schema with audit/metrics/RBAC tables
├── config/
│   ├── bedrock.js, bedrockService.js
│   ├── db.js, env.js
├── controller/
│   ├── sqlController.js               # V2 (legacy)
│   └── sqlControllerV3.js            # Shared V3/V4 controller logic
├── middleware/
│   ├── auth.js (V2)                   # API key auth (legacy)
│   ├── authV3.js                      # JWT/OAuth validation (NEW)
│   ├── rateLimit.js, requestContext.js
├── routes/
│   ├── sqlRoutes.js                   # V2 routes (legacy)
│   ├── sqlRoutesV3.js                 # V3 routes
│   └── sqlRoutesV4.js                 # V4 routes
├── services/
│   ├── metricsService.js              # Persists to DB
│   ├── schemaService.js
│   ├── auditService.js                # NEW: Audit logging
│   ├── rbacService.js                 # NEW: Role-based access
│   ├── dataPoliciesService.js         # AST-based row/column policies
│   ├── llmAdapter.js                  # NEW: Provider adapter layer
│   ├── queryOptimizationService.js    # NEW: Query explain & hints
│   └── responseVersioningService.js   # NEW: Schema versioning
├── utils/ (sqlGuard.js, etc.)
└── __tests__/
```

## API Reference - V4

Base URL: `http://localhost:3000`

### Authentication

All V4 endpoints require JWT in Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Query Endpoints

**`POST /api/v4/ask`** - Generate and execute SQL with pagination

Query params: `limit` (default 50, max 1000), `offset` (default 0), `schema_version`, `includeExplain`, `includeSuggestions`

**`POST /api/v4/ask/preview`** - Generate and validate SQL without executing

**`GET /api/v4/query/:queryId/explain`** - Get execution plan for query

Query param: `analyze` (true for EXPLAIN ANALYZE)

**`GET /api/v4/optimization/hints`** - Get recorded optimization suggestions

### Audit & Compliance Endpoints

**`GET /api/v4/audit/logs`** (requires admin/editor) - Get audit trail

Query params: `userId`, `action`, `days` (default 7), `limit`, `offset`

**`GET /api/v4/audit/stats`** (requires admin) - Get action statistics

**`POST /api/v4/schema/refresh`** (requires admin) - Force schema cache refresh

**`GET /api/v4/permissions`** - Check current user permissions

### Response Format (V4)

Successful response includes:
- `data.query` - SQL text, generation metadata, validation details
- `data.result` - Query results, row count, execution time
- `data.context` - Request/workspace/user context
- `pagination` - Limit, offset, total, hasMore
- `links` - Explain and optimization endpoints
- `meta` - Runtime metadata including auto-repair usage

### Error Codes

- `NO_TOKEN` / `TOKEN_EXPIRED` / `INVALID_TOKEN` / `TOKEN_REVOKED` (401)
- `INSUFFICIENT_ROLE` (403)
- `QUESTION_REQUIRED` / `SQL_VALIDATION_FAILED` (400)
- `QUERY_NOT_FOUND` (404)
- `REQUEST_FAILED` (500)

## Configuration - V4

Set these in `.env`:

```env
# Database
DATABASE_URL=postgresql://user:password@host/db
DATABASE_URL_READONLY=postgresql://readonly:password@host/db
DATABASE_URL_WRITER=postgresql://writer:password@host/db

# Server
PORT=3000
NODE_ENV=production

# AWS Bedrock
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=us.anthropic.claude-3-haiku-20240307-v1:0

# JWT/OAuth (NEW for V3)
JWT_SECRET=your_long_random_secret_key_min_32_chars
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=7d

# API Configuration
REQUEST_BODY_LIMIT=10kb
QUERY_TIMEOUT_MS=5000
MAX_QUERY_LIMIT=200
SCHEMA_CACHE_TTL_MS=300000
ALLOWED_TABLES=users,products,orders

# Bedrock
BEDROCK_MAX_TOKENS=512
BEDROCK_TEMPERATURE=0.1
ENABLE_AUTO_REPAIR=true
BEDROCK_TIMEOUT_MS=15000
BEDROCK_MAX_RETRIES=1
BEDROCK_RETRY_BASE_MS=200
BEDROCK_RATE_LIMIT_WINDOW_MS=1000
BEDROCK_RATE_LIMIT_MAX=5

# LLM Adapter
LLM_PROVIDER=bedrock

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=60

# Versioning
API_V1_SUNSET=2026-12-31
API_V2_SUNSET=2027-12-31
```

All required env variables enforced at startup.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start the API:

```bash
npm run dev
```

3. Run tests:

```bash
npm test
```

4. Use the request collection in `api.rest`.

## Deployment

### Docker

Build:
```bash
docker build -t text-to-sql-api:v4 .
```

Run:
```bash
docker run -e NODE_ENV=production --env-file .env -p 3000:3000 text-to-sql-api:v4
```

### Production Database Setup

Use read-only PostgreSQL role:

```sql
-- Create read-only role for queries
CREATE ROLE app_readonly LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE neondb TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

-- Create API service role for audit/metrics writes
CREATE ROLE api_service LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE neondb TO api_service;
GRANT USAGE ON SCHEMA public TO api_service;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO api_service;
```

## Operational Guidance

### SLO Targets
- Availability: 99.9%
- p95 latency: < 2s (preview), < 5s (execute)
- SQL validation success: > 95%

### Monitor These Metrics
- Request rate and success/error ratio
- Query execution times (p50, p95, p99)
- Audit log volume
- Optimization hints hit rate
- Token expiration events

### Incident Playbook

**Elevated 5xx errors:**
1. Check Bedrock service status
2. Verify database connectivity
3. Review recent schema changes

**Slow responses:**
1. Review query EXPLAIN plans
2. Check for missing indexes
3. Verify audit log volume

**AUTH failures:**
1. Verify JWT_SECRET configuration
2. Check token expiration settings
3. Verify workspace/user exists

## Real-world Use Cases

- Internal analytics assistant for non-SQL teams
- Support agent tooling for customer/order lookup
- Embedded SaaS reporting assistant
- Audit-compliant data access platform
- Multi-tenant analytics over shared database
- Operations command center dashboards