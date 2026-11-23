# Pharmacy demo branch testing

Demo site: https://greylad-pharmacy-demo.vercel.app/
Production site: https://greyladpharmacy.vercel.app/

This is the offline demo. It preserves the existing pharmacy demo screens and adds Overview, branch selection, isolated browser storage for each branch, owner-style all-branch totals, sample employee assignments, and branch labels on printed receipts and invoices.

The demo does not connect to production Supabase or create real employee accounts. Main Branch keeps the original demo storage key; additional branches use separate keys. When switching, the demo saves the branch being left and reloads the selected branch so inventory and sales cannot carry over between branches.

The demo is deployed separately from the live pharmacy. It is for fictional test records only.

## Current release

- Live pharmacy: deployed and READY at https://greyladpharmacy.vercel.app/
- Demo pharmacy: deployed and READY at https://greylad-pharmacy-demo.vercel.app/
- Production Supabase project: active; branch API code matches the deployed Edge Function.
- Demo build: generated from the preserved v0.15 offline application plus `branch-demo.js`.

When changing pharmacy functionality, update and verify both releases. Never copy demo data into the production database.
