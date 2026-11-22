# Pharmacy demo branch testing

Demo site: https://greylad-pharmacy-demo.vercel.app/
Production site: https://greyladpharmacy.vercel.app/

This directory contains the branch-testing layer for the existing, separate offline demo. It adds Overview, branch selection, separate browser-storage records for each branch, owner-style all-branch stock totals, test employee assignments and branch labels on printed receipts/invoices.

The demo does not connect to production Supabase or store actual employees. The Main Branch retains the existing demo's local storage key; additional branches use their own keys.

The demo Vercel project is built by combining the preserved original uploaded source file (SHA `925378b31f458a5ab7cd353d7b7c8e3a61aa401d`) with `branch-demo.js` using `build.cjs`. The original demo source is preserved on its previous Vercel deployment.

**Deployment status, November 22, 2026:** GitHub updates and automated build/browser checks are complete. Vercel returned `402 api-deployments-free-per-day` when publishing the updated demo. The public demo remains on its previous successful release until a new deployment succeeds. The production source is likewise awaiting a new Vercel release. Do not claim the branch UI is live until production aliases are checked.

Whenever a pharmacy change is released, test and deploy **both** the production application and the separate offline demo. Never mix test data with production data.