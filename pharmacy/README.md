# Greylad Pharmacy

Separate production application for retail and wholesale pharmacies. The existing Vercel demo is not changed.

Production address: https://greyladpharmacy.vercel.app
Future domain, not yet attached: pharmacy.greylad.me

## Current activation status

The production project is `greyladpharmacy` on Vercel. The separate Greylad Pharmacy Supabase project `ledyvvgpiabwdyyiwycm` is active, with the production `gp_*` workspace schema and `pharmacy-api` Edge Function deployed.

The initial approved owner identity is `George`, with pharmacy code `greylad-pharmacy`. The owner registration form accepts only approved identities, uses Supabase Auth, requires email verification, then provisions the empty pharmacy workspace and an Admin account at first sign-in. **An account is not considered activated until its email is verified and sign-in succeeds.** No sample medicines, customers or patient data are seeded.

GitHub source is in `Georgeseguya/Greylad` on the `pharmacy-online` branch, within `pharmacy/`. The original offline demonstration remains a separate Vercel project and is not the production application.

## Build and verify

Use Node 22 or later. Run `npm ci`, `npm run build`, then `npm test`.
Vercel uses `PHARMACY_API_URL=https://ledyvvgpiabwdyyiwycm.supabase.co/functions/v1/pharmacy-api` for all targets. This URL is public; service keys are never used by the frontend. With no API URL, sign-in stays disabled. There is no demo fallback or local stock database.

## Backend activation

1. Create a separate Supabase project in the agreed organisation. Do not apply this migration to VybaCash or FD TT Workspace.
2. Apply `supabase/migrations/20261122000100_pharmacy.sql` to that empty project. Tables use RLS with no direct anon/authenticated access. The Edge API alone accesses records with its injected service credential.
3. Supabase email verification must remain enabled. The public application only accepts owner registration for an approved identity; other staff must be enrolled by an administrator. The hosted Auth signup setting is currently enabled for the first-owner flow. Set the Site URL and redirect allowlist to the production address.
4. Build, then deploy `supabase/functions/pharmacy-api` with gateway JWT verification disabled. The function authenticates every protected request with Supabase Auth, checks current membership and checks pharmacy status. Only login/refresh are unauthenticated routes.
5. Set `PHARMACY_SITE_URL` on the function. Check the function receives its injected secret and publishable keys. Never add a secret/service key to Vercel, browser code or GitHub.
6. For the first pharmacy owner, use the approved registration form and confirm the email, then sign in with the pharmacy code and username. The server creates the initial empty workspace and the Admin membership once. Other accounts still require approved provisioning.
7. Automated local checks cover tenant isolation, stale writes, stock calculations, wholesale, invoice settlement, user roles and UI rendering. Hosted two-tenant concurrency, real-email registration, recovery and complete privacy controls still require final verification before processing actual patient data.
8. Configure backup retention and a tested restore procedure for the plan selected. The application provides an Admin export, not a browser restore of production records.

## Platform account provisioning

The script requires a pre-existing Supabase Auth user ID. It does not create or email passwords. Supply `SUPABASE_URL` and `SUPABASE_SECRET_KEY` securely in the operator's shell. Keep profile JSON outside Git.

Create pharmacy profile fields: `pharmacyName`, `pharmacyCode` (lowercase hyphenated login code), `userId`, `username`, `name`, `designation`. Run `node scripts/provision.cjs pharmacy /path/profile.json`. It atomically creates an empty pharmacy workspace and its first Admin membership. It returns the pharmacy ID.

Add account profile fields: `pharmacyId`, `userId`, `username`, `name`, `designation`, `role`. Run `node scripts/provision.cjs member /path/profile.json`. The platform can appoint Admins and Managers. Within the app, Admins/Managers may change only existing nonprivileged staff accounts, never themselves or other management appointments.

## Behaviour

Overview shows stock alerts, daily sales, unpaid invoices and recent transactions according to access. Medicine brand names remain mandatory. Every accepted operation is re-executed on the server from current records. Client totals, actor names, timestamps and proposed ledgers are not trusted. Revision checks prevent concurrent overwrites. The database commits the ledger and audit entry atomically.

Wholesale supports business details, TIN/licence references, a wholesale price per smallest unit, minimum quantities and calculated prices for configured larger packs. Wholesale sales require a saved business customer. Invoices remain unpaid until full settlement; they do not reserve stock. Credit-ledger dispatch, partial repayments and credit limits are not implemented in this release.

## Remaining verification and setup

- Confirm the Supabase Auth Site URL and email confirmation redirects point to `https://greyladpharmacy.vercel.app`. Hosted Auth settings are not changed by `config.toml`.
- Verify the initial owner account with a real confirmation email. Do not bypass email verification.
- Configure the email sender and delivery retries, password recovery and staff invitation process.
- Configure protected backups and test a restore. Clinical and patient records should not be used in production until privacy, security, audit and disaster-recovery checks are completed.
- The current online workspace uses a transactionally guarded JSON ledger. High-volume wholesale workflows require normalized tables, performance testing and pagination.
- Branch management is represented by a separate secure schema in the same Supabase project; transactional integration with the production retail/wholesale workspace is still required.

The production interface has no sample/demo workspace or local stock fallback.

## Future domain

After approval, add `pharmacy.greylad.me` to this Vercel project, verify DNS, then update Supabase site/redirect URLs, `PHARMACY_SITE_URL`, and the frontend canonical site URL. Keep the demo deployment separate. No DNS change is included now.
