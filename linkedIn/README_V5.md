# Text-to-SQL API V5 Rollout Notes

## What V5 Adds
- Dedicated `/api/v5` route layer while preserving `/api/v1`, `/api/v2`, `/api/v3`, and `/api/v4`.
- Strict validator mode for V5 that can reject wildcard selection (`SELECT *`).
- Strict policy coverage mode for non-admin V5 requests (deny by default if referenced tables are missing policies).
- Transaction-local workspace context setup (`app.current_workspace_id`) before strict V5 query execution.
- New migration asset `SQL/migration_v5.sql` for tenant discriminator columns and PostgreSQL RLS policy setup.
- Expanded response schema support with `schemaVersion: v5` and explicit `data.security` payload.

## Legacy Compatibility Kept Intact
- V1 and V2 endpoints remain mounted for backward compatibility.
- V3 and V4 remain fully available while V5 is introduced.
- Deprecation successor link now points to V5, but older versions are not removed.

## Validation and Testing Improvements
- Added strict-mode unit tests for SQL guard wildcard handling.
- Added strict-policy tests for deny-by-default behavior.
- Added V5 response schema tests.
- Added test gate script `npm run test:twice`.
- CI now runs tests twice to reduce flaky regressions before Docker build.

## Suggested Messaging for Release
- V5 focuses on safer multitenant defaults and stricter policy controls.
- V5 is additive: no forced migration break for clients on V1-V4.
- Security posture is stronger with strict validation + strict policy coverage + RLS migration path.
