# Saw Mill System: deployment guide

This guide prepares the existing app for the proposed Vercel + Render + TiDB Cloud setup. It does not create cloud accounts or deploy anything. The frontend, API, and database stay as separate services.

## Before choosing a plan

The free plans are useful for learning and previews, but they are not a suitable production plan for a sawmill business:

- **Vercel Hobby is for personal, non-commercial use.** A business website needs a plan that permits commercial use.
- **Render says its free web services are not for production.** They sleep after inactivity, can take about a minute to wake, use temporary local storage, and may be suspended when free limits are reached. Use a paid, always-on service for the business API.
- **TiDB Cloud Starter has free quotas and performance limits.** When quotas are reached, requests can be throttled or denied. Check the current plan and backup options before storing real business data.
- A custom domain costs money and has not been purchased. Use the provider URL temporarily; replace it with your own domain after you buy one.

See the provider details: [Vercel commercial-use rules](https://vercel.com/docs/limits/fair-use-guidelines), [Render free plan](https://render.com/docs/free), and [TiDB Cloud Starter FAQs](https://docs.pingcap.com/tidbcloud/serverless-faqs/).

## What is already prepared

- The Vite frontend reads `VITE_API_URL`; the older `VITE_API_BASE_URL` still works for existing setups.
- `client/vercel.json` sends browser page routes to the React app so refreshing a nested route can work.
- The Express API already reads the host-provided `PORT`, has `/api/health` and database-aware `/api/ready` checks, uses exact-origin CORS, and requires TLS and strong secrets in production.
- No production service, DNS record, database, or secret was created or changed. The local MySQL service was not available during preparation, so a real database connection is unverified.

## 1. Keep the project safe

1. Review and save your current work in a private GitHub repository. This workspace currently has local changes and no configured Git remote; do not discard or reset them. Do not commit `.env` files, backups, or secrets.
2. Keep the frontend in the `client` folder, the API in `server`, and the database in TiDB Cloud. Do not put database credentials in frontend settings.
3. Pick the same region for the API and database when possible.
4. Use separate database accounts for the running API, schema migrations, backups, and restores. Give each account only the permissions it needs.

## 2. Create the TiDB database

1. Create a TiDB Cloud cluster and a database for the app. Review its plan, quotas, backup/restore features, and expected cost first.
2. Enable the secure public connection and TLS. Download the CA certificate provided by TiDB.
3. Add only the Render service's documented outbound IP ranges to TiDB's IP allowlist. Render shows the applicable ranges for the service and region. Do not allow `0.0.0.0/0` or all public IPs. If the chosen Render plan does not provide stable/usable egress addresses for this setup, choose a compatible paid networking option before connecting.
4. Create a limited application database user and a separate migration user. Do not use the TiDB organization or cluster administrator account for the running API.

TiDB supports common MySQL clients such as `mysql2`, but MySQL compatibility is not complete. Check the app's schema and queries against TiDB before using real data: [TiDB MySQL compatibility](https://docs.pingcap.com/tidbcloud/mysql-compatibility/) and [Node.js mysql2 guide](https://docs.pingcap.com/developer/dev-guide-sample-application-nodejs-mysql2/). TiDB's public endpoint requires TLS and IP allowlisting: [TiDB connection guide](https://docs.pingcap.com/tidbcloud/connect-via-standard-connection-serverless/).

### Apply the schema carefully

The API does not run migrations at startup. Keep schema changes as a separately reviewed release step.

For a **new, empty database only**, use the prepared bundle `server/database/tidb_init.sql`. It combines the current base schema and migrations `007`, `009`, and `010` in order. The base schema already contains the invoice columns from migration `008`, so do not apply `008` again after it. The bundle is a convenience copy of the source files; regenerate it if those source files change.

The equivalent source-file order is:

```text
server/database/schema.sql
server/database/007_wood_type_catalogue.sql
server/database/009_additional_regional_wood_names.sql
server/database/010_invoice_wood_type_foreign_key.sql
```

Use a MySQL client with TiDB's TLS CA and the migration account. Follow TiDB's current connection instructions for the exact command flags and endpoint. Check each script's result before continuing. Do not run these commands on a database containing records. TiDB foreign key support depends on the cluster version; use a version where it is generally available and verify the schema on a disposable database first. [TiDB foreign key documentation](https://docs.pingcap.com/tidbcloud/foreign-key/)

For an **existing database**, first make and verify a backup. Compare the actual tables and columns with the base schema and each migration, then apply only migrations that are missing. Migrations `002` through `006` and `008` are earlier changes already represented in the current base schema. Some migrations use `ALTER TABLE` and cannot safely be repeated. The repository has no migration-history table or automated migration runner, so record the applied filenames and get a database administrator to review them. Do not guess which files have run.

Do not import schema files until the database has been confirmed empty or its current schema has been checked. Do not use the API's auto-start process to run migrations.

### Copy data from XAMPP MySQL

The initialization bundle creates a clean database; it does not copy your current local records. To preserve existing data, migrate a full export into a separate empty TiDB test database first:

1. In XAMPP, start MySQL and stop app users from making changes while you export. Open phpMyAdmin, select only the sawmill application database, choose **Export → Custom**, and include **Structure and data** for all application tables. Keep UTF-8/utf8mb4. Do not include system databases. If phpMyAdmin offers **Add CREATE DATABASE / USE**, leave it off so the dump can go into a separate test database. Save the `.sql` file in a private location.
2. Keep the local database as it is. Do not import into or drop it. Check that the export file exists and has a sensible non-zero size; keep a second copy before any cloud import.
3. Create a separate empty TiDB test database. Import the dump using a MySQL client and TiDB's TLS CA, following TiDB's current connection instructions. For a small/medium SQL file, the general form is:

   ```sh
   mysql --host=YOUR_TIDB_HOST --port=YOUR_TIDB_PORT --user=YOUR_IMPORT_USER --password --ssl-mode=VERIFY_IDENTITY --ssl-ca=PATH_TO_TIDB_CA YOUR_EMPTY_TEST_DATABASE < sawmill-export.sql
   ```

   Replace each uppercase placeholder with values shown in your own TiDB console. The password prompt keeps the password out of the command. Never send the dump or credentials in chat. For a large export, use TiDB's currently supported import tool instead of a browser upload.
4. Do **not** run `tidb_init.sql` on this imported copy. Compare the imported columns, indexes, seed data, and foreign keys with `schema.sql` and migrations `002`–`010`. Apply only verified missing migrations, one at a time, to the test copy. Check row counts and important relationships before considering a cutover.
5. Keep the local XAMPP database untouched as the rollback copy. Do not point the live API at TiDB until the test import and application compatibility checks succeed and you explicitly approve the cutover.

TiDB Cloud's managed Data Migration feature is not available on the Starter plan, so the export/import method is a separate one-time migration; verify current plan and tooling limits before beginning. [TiDB MySQL migration options](https://docs.pingcap.com/tidbcloud/migrate-from-mysql-using-data-migration/)

## 3. Deploy the API to Render

Create a **Web Service** from the existing repository:

- Root directory: `server`
- Runtime: Node
- Build command: `npm ci --omit=dev`
- Start command: `npm start`
- Health check path: `/api/ready`
- Use the paid always-on plan for a business service.

Add these variables in Render's private environment settings. Do not add them to Git, Vercel, or this guide.

| Variable | Value to enter |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Leave for Render to provide |
| `DB_HOST` | TiDB endpoint host |
| `DB_PORT` | TiDB endpoint port |
| `DB_NAME` | The database you created |
| `DB_USER` | Limited API database user |
| `DB_PASSWORD` | That user's private password |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | Contents of TiDB's CA certificate |
| `JWT_SECRET` | A new random value, at least 32 characters |
| `JWT_REFRESH_SECRET` | A different new random value, at least 32 characters |
| `HEALTH_CHECK_TOKEN` | Another separate random value, at least 32 characters |
| `CLIENT_URL` | Exact HTTPS origin of the frontend; no path or trailing slash |
| `COOKIE_SAME_SITE` | `Strict` for the final frontend/API subdomains under your own domain |
| `TRUST_PROXY_HOPS` | `1` when one trusted proxy sits in front of the app |
| `MILL_NAME`, `MILL_ADDRESS`, `MILL_PHONE`, `MILL_EMAIL` | Business details shown on bills, as applicable |
| `MILL_TAX_ID` | Tax ID, if applicable |

Generate each secret on a trusted computer, and enter it directly into Render's secret settings. For example, run this command three separate times and do not paste the results into chat or source files:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Render's environment settings keep secrets out of the repository: [Render environment variables](https://render.com/docs/configure-environment-variables). The API needs the TiDB CA because it verifies the TLS certificate. Never disable certificate verification to make a connection work.

Render provides HTTPS for its service URL and custom domains. Add the API's custom domain only after you own a domain; Render's dashboard shows the exact DNS records to add: [Render custom domains](https://render.com/docs/custom-domains). Do not guess DNS records.

## 4. Deploy the frontend to Vercel

Create a Vercel project from the same repository:

- Root directory: `client`
- Framework preset: Vite
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable for Production: `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`

Replace the example URL with the real Render service URL shown in its dashboard. `VITE_API_URL` is public browser configuration. Never put passwords, JWT values, database settings, or health tokens in a `VITE_` variable. Rebuild the frontend after changing this value.

Vercel's generated site URL and Render's generated API URL are on different top-level domains. Browsers may block the API's authentication cookies as third-party cookies. For reliable sign-in, buy/use a domain you own and set the site and API on subdomains of that domain, such as `www.<your-domain>` and `api.<your-domain>`. Use the exact site origin in `CLIENT_URL`, keep HTTPS on both, and use `COOKIE_SAME_SITE=Strict`. Confirm browser login works after both custom domains are active. Do not loosen cookie or CORS settings broadly to bypass a browser warning.

The API currently allows one exact origin using `CLIENT_URL`, which is safer than `*`. Set it to the final website origin. Preview deployment URLs will not be accepted unless you deliberately set up a separate preview environment.

## 5. Connect a domain later

You have not bought a domain yet, so no domain or DNS record can be configured now. After buying a `.in` or `.com` domain:

1. Add the website domain in Vercel and the API subdomain in Render.
2. Copy the exact DNS records shown by each provider into your registrar's DNS page. Do not use sample records from another project.
3. Wait until both providers show the domain as verified and HTTPS as active.
4. Set Vercel's `VITE_API_URL` to the real API HTTPS URL and Render's `CLIENT_URL` to the exact website HTTPS origin. Redeploy/rebuild as requested by each service.
5. Test the site, API health, sign-in, sign-out, and a safe read-only page. Do not test writes against real business data.

Vercel issues HTTPS certificates after DNS verification: [Vercel custom domain setup](https://vercel.com/docs/domains/set-up-custom-domain). The registrar's DNS screen and the hosting provider dashboard provide the actual record values.

## 6. Admin account and bills

After the schema is installed and `/api/ready` reports ready, use the existing `server/scripts/createAdmin.js` once with the production database settings in a trusted temporary environment. Use a unique strong admin password. Do not leave the bootstrap password in the always-on service settings. Then sign in and create staff accounts with the correct roles.

The project includes PDF fonts with the server, but regional-language invoice output still needs a real PDF check after deployment. Verify that each selected script has an appropriate bundled font and that the generated PDF displays and prints correctly. Do not assume a browser font guarantees the PDF font works.

## 7. Uploads and persistent files

There is no working file-upload API in the current project. Product images are URLs, and PDF font assets ship with the server. Do not store future customer uploads on Render's local disk because it is not persistent on the free service. When uploads are implemented, use a private object-storage service, restrict file size/type in the API, and keep credentials only in Render's secret settings.

## 8. Logs, health checks, and release checks

- `/api/health` checks whether the API process responds.
- `/api/ready` checks the API and database (`SELECT 1`); Render should use it as the health check.
- `/api/db-health` is protected by `HEALTH_CHECK_TOKEN`; keep that token private.
- Render collects the app's standard output logs. Do not log passwords, tokens, request bodies, or full connection strings. Configure alerting and retention in the provider dashboard.

Run checks from the project folder before a release:

```sh
npm ci
npm ci --prefix client
npm ci --prefix server
npm run build:client
npm test --prefix server
npm run lint --prefix client
```

These local checks do not prove the cloud database, deployed domains, browser cookies, or invoice fonts work. Test those only after services are configured. Keep write tests in a separate test database with safe sample records.

## 9. Backups and restore

Before real records are stored, confirm the chosen TiDB plan includes backups and point-in-time restore suitable for the business. Keep a separate encrypted export in private storage and limit who can access it. A backup is not verified until a restore has succeeded into a separate recovery database or cluster.

For a manual export, use TiDB's documented TLS connection method and a backup-only account. Store the password securely and avoid putting it in a command line or shell history. Restore only to a separate empty recovery database first. Check the recovered tables and data before planning any production switch. Never test restore over the production database.

No backup was created or restored during this preparation. Backup status is therefore **not configured and not verified**.

## Current status

- No code was pushed and no cloud service, paid plan, database, domain, DNS record, or certificate was created.
- The website is not deployed and is not online.
- There is no purchased domain, so custom DNS and domain HTTPS cannot be set up yet.
- A real TiDB connection, production migrations, admin account, login, regional PDF output, and deployed smoke tests remain to be done after hosting accounts and a domain are ready.
- The proposed free plans do not meet reliable commercial production needs. Choose suitable paid plans before using real business records.
