# Text to SQL API

Production-ready Node.js API V2 that translates natural language to safe SQL using AWS Bedrock and executes read-only analytics queries on PostgreSQL.

## API Versioning

Current stable version:

- V2 base path: `/api/v2`

Legacy compatibility:

- V1 base path: `/api/v1` (deprecated)
- V1 responses include deprecation headers (`Deprecation`, `Sunset`, `Link`)

What V1 looked like:

- Core paths were under `/api/v1` such as `/api/v1/ask`, `/api/v1/ask/preview`, `/api/v1/ask/execute`
- Same authentication model (`x-api-key`)
- Same question payload structure

Migration guidance:

1. Replace `/api/v1` with `/api/v2` in clients.
2. Keep request/response contracts unchanged unless otherwise noted.
3. Monitor for V1 sunset date from response headers.

## Why this project exists

This service is designed for teams that want to offer natural-language analytics without giving direct SQL access to end users.

Primary goals:

- Convert user questions to SQL
- Keep execution read-only and bounded
- Expose preview and execute modes for safer workflows
- Support real-world operations with metrics, rate limits, and CI

## Core features

- Bedrock-powered SQL generation
- SQL preview endpoint (generate and validate only)
- SQL execute endpoint (generate, validate, run)
- One-shot SQL auto-repair when first generation fails validation
- Dynamic schema introspection with cache
- Strict SQL AST validation:
  - single statement
  - SELECT only
  - allowlisted tables and columns
  - mandatory LIMIT with configurable max
- Query timeout and request size limits
- API key auth + rate limiting
- Request IDs and in-memory metrics endpoint

## Architecture

Request flow for execution:

1. Client sends question with `x-api-key`
2. API loads schema metadata (cached, introspected from DB)
3. Bedrock generates SQL using schema context
4. SQL is validated against AST rules
5. If invalid, optional one-shot repair is attempted
6. If valid, query executes with timeout
7. Response includes SQL, row count, and data

Preview mode follows the same generation and validation path, but does not execute SQL.

## Project structure

```
text-to-sql-api/
├── server.js
├── package.json
├── api.rest
├── Dockerfile
├── .dockerignore
├── .github/workflows/ci.yml
├── config/
│   ├── bedrock.js
│   ├── bedrockService.js
│   ├── db.js
│   └── env.js
├── controller/
│   └── sqlController.js
├── db/
│   └── schema.js
├── middleware/
│   ├── auth.js
│   ├── rateLimit.js
│   └── requestContext.js
├── routes/
│   └── sqlRoutes.js
├── services/
│   ├── metricsService.js
│   └── schemaService.js
├── utils/
│   └── sqlGuard.js
└── __tests__/
    ├── askRoute.test.js
    └── sqlGuard.test.js
```

## API reference

Base URL: `http://localhost:3000`

### Health

`GET /health`

Returns service status.

### Metrics

`GET /metrics`

Returns in-memory counters and latency summary for operational visibility.

### Ask (backward-compatible execute)

`POST /api/v2/ask`

Equivalent to execute mode.

### Ask preview

`POST /api/v2/ask/preview`

Generates and validates SQL without running it.

Request body:

```json
{
  "question": "Show orders with user name and total amount"
}
```

Response example:

```json
{
  "status": "success",
  "mode": "preview",
  "question": "Show orders with user name and total amount",
  "sql": "SELECT o.id, u.name, o.total FROM orders o JOIN users u ON u.id = o.user_id LIMIT 50",
  "autoRepairUsed": false
}
```

### Ask execute

`POST /api/v2/ask/execute`

Generates, validates, and executes SQL.

Response example:

```json
{
  "status": "success",
  "mode": "execute",
  "question": "Show all users",
  "sql": "SELECT u.id, u.name, u.email FROM users u LIMIT 50",
  "autoRepairUsed": false,
  "rowCount": 3,
  "data": [
    { "id": 1, "name": "Alice", "email": "alice@example.com" }
  ]
}
```

### Refresh schema cache

`POST /api/v2/schema/refresh`

Forces schema metadata refresh from database.

## Error model

Errors are returned with stable codes:

- `QUESTION_REQUIRED`
- `SQL_VALIDATION_FAILED`
- `REQUEST_FAILED`
- `SCHEMA_REFRESH_FAILED`

Example:

```json
{
  "status": "error",
  "code": "SQL_VALIDATION_FAILED",
  "error": "Query must include LIMIT <= 200",
  "sql": "SELECT id FROM users",
  "autoRepairUsed": true
}
```

## Security model

Current protections:

- API key authentication (`x-api-key`)
- Rate limiting per IP
- Body size limits
- AST-level SQL safety checks
- Read-only query type enforcement
- Timeout-bound execution
- LIMIT enforcement

### Critical production recommendation

Use a read-only Postgres role in `DATABASE_URL`.

```sql
CREATE ROLE app_readonly LOGIN PASSWORD 'replace_me';
GRANT CONNECT ON DATABASE neondb TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
```

This is the strongest protection against accidental writes.

## Configuration

Set these in `.env`:

```env
DATABASE_URL=postgresql://user:password@host/db
PORT=3000

AWS_ACCESS_KEY_ID=...
API_KEY_AWS_BEDROCK=...
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=us.anthropic.claude-3-haiku-20240307-v1:0

API_SECRET=replace_with_long_random_secret

REQUEST_BODY_LIMIT=10kb
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=60
QUERY_TIMEOUT_MS=5000
MAX_QUERY_LIMIT=200

ENABLE_AUTO_REPAIR=true
SCHEMA_CACHE_TTL_MS=300000
ALLOWED_TABLES=users,products,orders

BEDROCK_MAX_TOKENS=512
BEDROCK_TEMPERATURE=0.1
```

Required env vars are enforced at startup in non-test environments.

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
docker build -t text-to-sql-api .
```

Run:

```bash
docker run --env-file .env -p 3000:3000 text-to-sql-api
```

### CI

GitHub Actions workflow at `.github/workflows/ci.yml` runs:

1. `npm ci`
2. `npm test`
3. Docker image build validation

## Operational guidance

### Recommended SLO starting points

- Availability: 99.9%
- p95 API latency: < 1.5s (preview), < 2.5s (execute)
- SQL validation failure rate: track weekly trend

### Monitor

- `/metrics` response values
- 5xx rate
- Bedrock latency and error frequency
- Query timeout occurrences
- Rate limit hit rate

### Incident playbook (short)

1. Elevated 5xx:
   - Check DB connectivity and Bedrock errors
   - Reduce traffic using tighter rate limits
2. Bad SQL quality spike:
   - Refresh schema cache endpoint
   - Verify schema drift and allowed table list
3. Slow responses:
   - Reduce max rows (`MAX_QUERY_LIMIT`)
   - Lower `QUERY_TIMEOUT_MS` if needed

## Real-world use cases

- Internal analytics assistant for non-SQL teams
- Support agent tooling for customer/order lookup
- Embedded SaaS reporting assistant
- Operations command center dashboards

## Current limitations

- Metrics are in-memory only (reset on restart)
- API auth is shared-key, not user identity-based
- No persistent audit log yet
- No pagination contract for very large results

## Suggested next roadmap

1. Replace API key with JWT/OAuth and role-based data policies
2. Persist metrics and request audit logs
3. Add pagination and response schema versioning
4. Add query explain endpoint and optimizer hints
5. Add multi-tenant policy controls per workspace/customer