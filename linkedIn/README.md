# Text-to-SQL API V4 Feature Rollout

## Overview
This document summarizes all major improvements delivered across Phase 0 through Phase 4.

## Phase 0: Foundation Stability
- Fixed SQL migration defaults in `SQL/migration_v3.sql` by correcting timestamp defaults to `NOW()`.
- Removed the double-LIMIT execution bug in V3 query execution by applying AST-based pagination rewrites before execution.
- Hardened Bedrock request handling with timeout and retry controls to improve resiliency under transient failures.
- Added and extended SQL guard tests for pagination rewrite behavior.

## Phase 1: Safety and Data Access Hardening
- Replaced string-based policy application with AST-driven query policy enforcement in `services/dataPoliciesService.js`.
- Added explicit `applyPolicies` and retained compatibility alias for existing call sites.
- Introduced read/write database separation in `config/db.js` with support for:
  - `DATABASE_URL_READONLY`
  - `DATABASE_URL_WRITER`
- Routed write-heavy paths to writer DB access:
  - Audit logging
  - Metrics persistence
  - Optimization hint writes/updates
- Improved optimization plan parsing robustness for `EXPLAIN (FORMAT JSON)` shapes.
- Added automated tests for policy application success and failure scenarios.

## Phase 2: LLM Resilience and Provider Abstraction
- Added process-level outbound Bedrock rate limiting in `config/bedrockService.js`.
- Implemented Bedrock request queueing window controls with configurable limits:
  - `BEDROCK_RATE_LIMIT_WINDOW_MS`
  - `BEDROCK_RATE_LIMIT_MAX`
- Kept timeout and retry support active together with Bedrock rate limiting.
- Added a provider adapter layer in `services/llmAdapter.js`.
- Updated controllers to use adapter-based LLM calls.
- Added tests validating adapter behavior and unsupported provider handling.

## Phase 3: API V4 Release
- Added `/api/v4` routes via `routes/sqlRoutesV4.js`.
- Mounted V4 in `server.js` and updated supported versions metadata.
- Expanded response versioning to include schema `v4` in `services/responseVersioningService.js`.
- Added reusable version middleware factory to support per-route default schema versions.
- Made controller responses dynamic by base path and negotiated schema version.
- Updated v1 successor-version deprecation link to point at V4.
- Added tests for v4 response formatting and middleware behavior.

## Phase 4: Documentation Modernization
- Updated main project README to V4 and documented:
  - V4 endpoints
  - V4 response shape
  - New environment variables for DB split and LLM controls
  - Bedrock outbound rate limiting configuration
  - Updated Docker tags and usage examples
- Created this `linkedIn/README.md` file as the phase-by-phase feature summary.

## Key V4 Value Summary
- Safer SQL execution path
- Stronger policy enforcement
- Better LLM resilience under load
- Clear API versioning and migration path
- Improved operational documentation for production adoption
