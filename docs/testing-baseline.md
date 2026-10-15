# Testing baseline

Captured: 2026-10-13T12:22:31.606Z

Source commit: `22be6e3bcf54fd012104fe233ef6652dd01941ff`.

Environment: Windows, Node.js 24.13.1, npm 11.8.0, Vitest 4.1.11.

Both existing suites and both TypeScript checks passed. PostgreSQL I/O is mocked in the backend tests; client generation was required, but a running database was not.

| Component | Test files | Passing tests | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|---:|---:|
| backend | 4 | 48/48 | 30.23% | 33.33% | 40.62% | 33.02% |
| frontend | 14 | 18/18 | 46.42% | 43.79% | 40.25% | 47.68% |

The machine-readable snapshot is [testing-baseline.json](testing-baseline.json). It preserves per-file metrics, totals/covered counts, source revision, runtime versions, and SHA-256 hashes of the original coverage configurations and lockfiles. Live HTML reports are generated at `backend/coverage/index.html` and `frontend/coverage/index.html`; those directories are ignored by Git and overwritten by future runs.

## Reproduce

Run from the repository root:

```sh
cd backend
npm ci --ignore-scripts --no-audit --no-fund
npm run db:generate
npm run typecheck
npm run test:coverage
cd ../frontend
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run test:coverage
```

Installation skipped package lifecycle scripts. Prisma generation was invoked explicitly and downloaded its official schema engine. No application source, tests, package manifests, lockfiles, or coverage configuration were changed for this measurement.

## Measurement scope

- Backend includes `src/**/*.ts`, excluding type-only modules and generated Prisma code. Existing per-file 100% thresholds apply to validators and mappers.
- Frontend includes `src/**/*.{ts,tsx}`, with the original exclusions preserved: entrypoint, test support/test files, design system, types, index files, constants, query keys and the query-client configuration.
- Frontend percentages therefore do not measure the entire frontend. Future comparisons must use the same scope, or explicitly describe a scope change.
- Vitest console output omits some fully covered files; the JSON snapshot retains every measured file.
- Several component tests mock their hooks and HTTP dependencies. Passing component tests do not exercise those original modules, which explains their 0% coverage.
- These results cover the existing unit/component suites and type checks on Windows. A Linux CI run, real database integration, browser E2E, and production builds were not part of this baseline.

## Backend test priorities

Priority describes the order for useful test additions, not defect severity. The percentages below are line coverage.

| Priority | Module / current coverage | Missing behaviors to exercise |
|---|---|---|
| First | `src/features/todos/router.ts` — 44% lines, 16.66% branches | GET by ID, valid PATCH and DELETE, missing records, invalid IDs, empty/unknown update fields, repository failures. Existing route tests focus on list/create and invalid create payloads. |
| First | `src/core/config.ts` — 0% | Override and environment precedence, component-derived URL, reserved characters, scheme normalization, each missing required setting; isolate environment changes. |
| First | `src/factory.ts`, `src/api/health.ts` — 0% | Health probe success/failure, 404, malformed JSON, oversized body, generic unexpected errors, already-sent response handling, fixed docs endpoints. Use mocked database and Supertest. |
| Next | `src/core/database.ts` — 66.66% | Startup table initialization invokes the expected fixed SQL and propagates errors; no real PostgreSQL connection. |
| Next | `src/core/lifespan.ts` — 0% | Connect/initialize/listen ordering, startup cleanup, shutdown disconnect, signal handlers, disconnect errors and timeout; mock server/process boundaries and restore listeners/timers. |
| Later | `src/main.ts` — 0% | Startup rejection is reported and exitCode is set, with mocked start and restored process state. |

Mappers, validators and repository each already have 100% measured line coverage. Additional tests there should be justified by a new behavior or a concrete missing assertion rather than the coverage number alone.

## Frontend test priorities

| Priority | Module / current coverage | Missing behaviors to exercise |
|---|---|---|
| First | `src/lib/http.ts` — 0% | Successful JSON, 204 without parsing a body, request options/headers, abort preservation, network failure, validation failure, server detail, malformed error JSON and fallback message. Mock fetch, not the function under test. |
| First | Create/update/delete mutation hooks — 0% | API calls, failure behavior, cancel-before-cache-update ordering, deduplicated insertion, replacing the matching task, removing the selected task, and absent-cache behavior. Use an isolated real QueryClient with retry disabled. |
| First | `src/features/todos/api/todos.ts` — 57.14% | PATCH sends only writable fields and omits absent fields; DELETE uses the correct ID/method. List and create already have direct tests. |
| First | `src/features/todos/utils/todos.ts` — 52% lines, 33.33% branches | Text/date validation boundaries, impossible dates, completed filter, due-date/newest sorting and ties, overdue boundary/completed tasks, and deterministic date formatting. Freeze time where relevant. |
| Next | Query/filter/busy hooks — 0% | Abort signal forwarding, query success/error, filter/search/sort state changes, and matching pending mutations. Restore clients and mocks between tests. |
| Next | `TodoList` — 20%; `TodoEmptyState` — 0%; `DeleteTodoDialog` — 37.5% | Loading/error/populated/filtered-empty states, forwarding the correct task to callbacks, first-task action, successful deletion, failure retaining confirmation, and busy-state blocking. |
| Next | `TodosPage` — 50%; `TodoItem` — 35.71% branches | Editor/delete selection, toggle success/failure and notices, pending controls, optional descriptions/dates, and completed/overdue rendering. |
| Later | `useNotice` — 71.42%; `AppProviders` — 0% | Notice expiry/replacement/unmount cleanup; custom/default query client and rendered children/provider context. |

The first agent-driven test additions should target one concrete backend behavior and one concrete frontend behavior from the First rows, then verify their assertions and compare coverage against this snapshot.
