# Saw Mill Management System — Quality Audit

**Date:** 2026-10-20  
**Scope:** Current workspace, running local frontend/API, configured MySQL database, and checked-in backend test suite.

## Executive summary

- The frontend production build and Oxlint completed successfully; all 80 backend tests passed.
- The live API connected to MySQL, the schema was initialized with 34 tables, and the public catalog endpoint returned HTTP 200.
- All 27 tested SPA paths rendered or followed their intended redirect. Eight public pages also passed a 375 px viewport overflow check.
- Two defects found during the audit were fixed: an invalid `sawing_jobs.raw_log_id` foreign key in the fresh schema and a false “session expired” alert for visitors with no login session.
- Full, live inventory/purchasing/billing workflows could not be exercised safely: the database contains no user accounts, so protected pages redirect to login. The existing backend tests exercise these workflows with test doubles, not the live MySQL data.
- Remaining concerns: the server dependency audit reports one distinct high-severity `braces` advisory (three affected package nodes) with no patched release available; `.env` is missing a strong, distinct refresh secret and has no usable health-check token; lint/build warnings remain.

## Results

| Area | Result | Evidence / limitation |
|---|---|---|
| Backend tests | **PASS** | `npm --prefix server test`: 80 passed, 0 failed. Covers mocked API/service behavior. |
| Frontend build | **PASS WITH WARNING** | `npm run build:client` succeeded. Minified JavaScript bundle is approximately 1,021 kB, above Vite's 500 kB warning threshold. |
| Frontend lint | **PASS WITH WARNINGS** | `npm --prefix client run lint` exited 0; 35 non-fatal warnings remain. `--quiet` reports no lint errors. |
| Dependency audit | **ACTION REQUIRED** | Client: 0 vulnerabilities. Server: npm reports 3 high-severity affected nodes (`braces`, `chokidar`, `nodemon`); the advisory scan identifies one distinct issue, CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm. No patched `braces` version is available in the registry at audit time; `npm audit fix --force` proposes a breaking nodemon downgrade, which was not applied. |
| Database connection | **PASS** | Application connection helper successfully pinged `localhost:3306/sawmill_db`. |
| Schema initialization | **PASS AFTER FIX** | Fresh schema initialized successfully; 34 tables exist. No data was deleted. The users table currently has 0 rows. |
| API/server startup | **PASS** | Frontend and API returned HTTP 200; `/api/health` reported online. |
| Public catalog | **PASS, EMPTY** | `/api/v1/catalog/products` returned HTTP 200 with an empty item list; no available inventory is currently recorded. |
| API authorization | **PASS** | Unauthenticated protected endpoints returned 401; `/api/db-health` returned 403 without its health token. |
| SPA routes | **PASS** | 27 paths checked: public routes, product details for a nonexistent product, login, all admin paths, and an unknown path. Public pages rendered; admin paths redirected to `/login`; unknown path redirected to `/`. |
| Responsive layout | **PASS FOR PUBLIC PAGES** | Home, About, Products, Services, Quote, Contact, Privacy, and Terms showed no horizontal overflow at 375 px viewport width. Admin layout could not be authenticated and tested. |
| Quote/contact validation | **PASS FOR INVALID CASE** | Browser submission without both phone and email was rejected with the expected validation message; no enquiry was written. Required-field browser validation was also present. Successful live submission was intentionally not performed because it would persist customer data. |
| Spam/honeypot | **PASS** | Live honeypot submission returned HTTP 400. Backend tests additionally cover spam rejection and rate limiting. |
| SQL injection resistance | **PASS FOR TESTED PATH; LIMITED** | SQL-shaped catalog search returned HTTP 200 and zero items. Repository search uses bound parameters. This is a focused probe, not a formal exhaustive penetration test. |
| CORS/security headers | **PASS FOR TESTED CONFIGURATION** | API returned `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`. For an untrusted origin, CORS returned the configured `http://localhost:5173`, not the caller's origin. CSP is disabled in development and configured for production. |
| Upload handling | **NOT APPLICABLE** | No file upload controls or upload middleware/routes were found in the scanned frontend and API routes. |
| Secret exposure in frontend bundle | **PASS FOR CHECKED KEYS** | Built assets contain none of the checked server secret variable names (`DB_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`, `HEALTH_CHECK_TOKEN`). No secret values are reproduced in this report. |
| Request logging | **PASS BY CONFIGURATION REVIEW** | Morgan's development logger does not log request bodies. Error stack traces are logged server-side; stacks are not returned for unexpected errors outside development. |

## Functional test coverage

The passing backend test suite covers:

- Login success, invalid credentials, inactive accounts, expired access tokens, missing tokens, and role/permission rejection.
- Inventory batch creation, receipts/issues, invalid quantities, insufficient stock, negative-stock prevention, movement history, and concurrent stock changes.
- Purchase creation/receiving and duplicate-receipt protection.
- Cutting job creation/start/completion, input consumption, output/yield/waste, and duplicate-completion protection.
- Sales order stock validation/reservation/fulfillment and billing calculations.
- Partial/full payment behavior, duplicate-payment idempotency, and invoice/receipt PDF generation.
- Report calculations, date filtering, CSV formula escaping, and report permission checks.
- Public enquiry validation, spam honeypot rejection, and rate limiting.

These tests use test doubles for the database and do **not** prove that each workflow has been executed against live MySQL records. Live successful login, inactive live account behavior, and protected ERP workflows remain unverified because there are no users in the initialized database.

## Fixes made during this audit

1. **Fresh-install database schema:** changed the `sawing_jobs.raw_log_id` foreign key from nonexistent `raw_logs(id)` to `timber_batches(id)`, whose `timber_type` distinguishes raw logs. This allowed the full schema to initialize. See [server/database/schema.sql](./server/database/schema.sql).
2. **Unauthenticated login UX:** the frontend no longer attempts token refresh for a `NO_TOKEN` response. A new visitor is no longer incorrectly told their session expired. Browser verification confirmed the login form remains visible with no expired-session alert. See [client/src/services/apiClient.js](./client/src/services/apiClient.js).

## Remaining issues and actions

1. **No initial administrator:** the database currently has zero users, so live login and protected dashboard testing are blocked. Bootstrap an administrator locally with the documented environment-variable-only script in [server/ADMIN_SETUP.md](./server/ADMIN_SETUP.md). Do not send the password in chat.
2. **Local secret configuration:** the refresh secret is not configured as a strong, distinct 32+ character value, and the health-check token is missing or still a template placeholder. Set strong, separate local values in `server/.env`; do not commit or share them. Production deployments must use dedicated secret management.
3. **High-severity dependency advisory:** `braces@3.0.3` is affected by CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm through the server development dependency chain. The available `braces` release is still in the affected range. No risky major downgrade was applied; recheck for an upstream patched release and update the transitive dependency when available.
4. **Lint warnings:** 35 non-fatal Oxlint warnings remain, primarily React effect/state patterns and unused imports/variables.
5. **Bundle size:** consider route-level code splitting to reduce the approximately 1,024 kB minified frontend JavaScript bundle.
6. **Live workflow validation:** after an administrator is bootstrapped, use a dedicated non-production dataset to verify authenticated inventory, purchase, cutting, order, payment, PDF, and report flows. The audit did not create or delete business records.

## Final visual and usability review

| Check | Result | Evidence / limitation |
|---|---|---|
| Home hero and image | **PASS** | At a 390 px viewport, the hero rendered and `/images/hero-banner.jpg` returned HTTP 200. Hero calls route to `/products` and `/quote`. |
| Mobile layout | **PASS FOR CHECKED VIEW** | At 390 px, document width was 375 px; no horizontal overflow was present. |
| Mobile navigation | **PASS FOR CHECKED KEYBOARD BEHAVIOR** | Opened the drawer, Shift+Tab kept focus inside it, and Escape closed it and returned focus to the menu toggle. |
| Enquiry form | **PASS FOR LABELS AND LAYOUT** | Contact form controls, including the honeypot, have associated labels; the form card rendered within the mobile viewport. No successful enquiry was submitted. |
| Admin dashboard | **NOT VERIFIED** | No user account exists in the database, so authenticated admin appearance and interactions could not be inspected. |
| Public-page auth request | **OBSERVED** | Public-page loads issue unauthenticated `/api/v1/auth/me` requests that return 401. No signed-in user is present; no false session-expired alert was shown. |
| Production build and lint | **PASS WITH BUILD WARNING** | Final `npm --prefix client run build` succeeded; `npm --prefix client run lint -- --quiet` exited 0. The minified JS bundle is 1,024.09 kB, above Vite's 500 kB recommendation. |

## Data-safety note

No database, existing user, or business record was deleted. The schema was added to `sawmill_db`; it contains 34 tables and currently has no user rows. The only live POST probes were invalid contact details and honeypot spam values, both rejected before persistence.
