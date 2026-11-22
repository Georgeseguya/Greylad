# Greylad Pharmacy

Separate production application for retail and wholesale pharmacies. The existing Vercel demo is not changed.

Production address: https://greyladpharmacy.vercel.app
Future domain, not yet attached: pharmacy.greylad.me

## Current activation status

The interface and backend source are prepared. **The dedicated Supabase project has not been created because the organisation has reached its free-project limit.** The published sign-in page remains closed until that project is provisioned and hosted integration checks pass. Do not enter real pharmacy or patient records before activation.

Source is stored under `pharmacy/` on the `pharmacy-online` branch of `Georgeseguya/Greylad`. Production deployments select this branch explicitly. Do not change the main Greylad website project or point this app at the repository default branch.

## Build and verify

Use Node 22 or later. Run `npm ci`, `npm run build`, then `npm test`.
Set `PHARMACY_API_URL=https://PROJECT.supabase.co/functions/v1/pharmacy-api` in Vercel before building the activated release. This URL is public; service keys are never used by the frontend. With no API URL, sign-in stays disabled. There is no demo fallback or local stock database.

## Backend activation

1. Create a separate Supabase project in the agreed organisation. Do not apply this migration to VybaCash or FD TT Workspace.
2. Apply `supabase/migrations/20261122000100_pharmacy.sql` to that empty project. Tables use RLS with no direct anon/authenticated access. The Edge API alone accesses records with its injected service credential.
3. Disable public signup in hosted Auth settings. `supabase/config.toml` records the intended settings but does not change hosted Auth by itself. Set the site URL and redirect allowlist to the production address.
4. Build, then deploy `supabase/functions/pharmacy-api` with gateway JWT verification disabled. The function authenticates every protected request with Supabase Auth, checks current membership and checks pharmacy status. Only login/refresh are unauthenticated routes.
5. Set `PHARMACY_SITE_URL` on the function. Check the function receives its injected secret and publishable keys. Never add a secret/service key to Vercel, browser code or GitHub.
6. Create approved Auth users through the platform's Supabase Auth administration. No public signup is provided. Use the provisioning script below to attach each user to a pharmacy.
7. Verify two distinct pharmacy tenants, suspended accounts, direct REST denial, concurrent checkouts, invoice settlement, clinical read filtering, session refresh and logout against the hosted service before opening sign-in. Run Supabase security/performance advisors.
8. Configure backup retention and a tested restore procedure for the plan selected. The application provides an Admin export, not a browser restore of production records.

## Platform account provisioning

The script requires a pre-existing Supabase Auth user ID. It does not create or email passwords. Supply `SUPABASE_URL` and `SUPABASE_SECRET_KEY` securely in the operator's shell. Keep profile JSON outside Git.

Create pharmacy profile fields: `pharmacyName`, `pharmacyCode` (lowercase hyphenated login code), `userId`, `username`, `name`, `designation`. Run `node scripts/provision.cjs pharmacy /path/profile.json`. It atomically creates an empty pharmacy workspace and its first Admin membership. It returns the pharmacy ID.

Add account profile fields: `pharmacyId`, `userId`, `username`, `name`, `designation`, `role`. Run `node scripts/provision.cjs member /path/profile.json`. The platform can appoint Admins and Managers. Within the app, Admins/Managers may change only existing nonprivileged staff accounts, never themselves or other management appointments.

## Behaviour

Overview shows stock alerts, daily sales, unpaid invoices and recent transactions according to access. Medicine brand names remain mandatory. Every accepted operation is re-executed on the server from current records. Client totals, actor names, timestamps and proposed ledgers are not trusted. Revision checks prevent concurrent overwrites. The database commits the ledger and audit entry atomically.

Wholesale supports business details, TIN/licence references, a wholesale price per smallest unit, minimum quantities and calculated prices for configured larger packs. Wholesale sales require a saved business customer. Invoices remain unpaid until full settlement; they do not reserve stock. Credit-ledger dispatch, partial repayments and credit limits are not implemented in this release.

## Work still required before activation

- Hosted Supabase deployment and end-to-end authentication/concurrency verification are blocked on project capacity.
- Account-change notifications are queued transactionally. Email sending, monthly-report scheduling and delivery monitoring are not connected. No email is represented as delivered.
- Pharmacy-name changes remain platform-managed. The requested email-code confirmation flow is not implemented yet.
- Password recovery and initial account activation need the chosen email provider and a verified recovery flow before real staff onboarding.
- Workspace storage is a transactionally guarded JSON ledger for initial use. High-volume wholesale operations will need normalized database tables and paginated queries as volume grows. This is not yet load-tested at that scale.

## Future domain

After approval, add `pharmacy.greylad.me` to this Vercel project, verify DNS, then update Supabase site/redirect URLs, `PHARMACY_SITE_URL`, and the frontend canonical site URL. Keep the demo deployment separate. No DNS change is included now.
