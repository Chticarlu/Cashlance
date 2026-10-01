# Invoice editing release — 2026-10-01

Source: invoice-edit-v1, previously validated Preview fb6b2a4; production base 8da7af7.

## Release corrections

- Correct invoice-date parsing on dashboard cards/list.
- Return both Stripe Portal flows to /account/billing, using the production domain or actual Preview URL; require same-origin Portal requests.
- Existing subscriptions go to billing instead of a second Checkout. Former subscribers may resubscribe without a new trial.
- Migration 20261001140000 follows 20261001130000: correct an unshared customer's name without violating email uniqueness. Shared customer identities remain unchanged; conflicting identities fail atomically.
- Invoice editing is service_role-only, checks authenticated ownership supplied by the server, and locks sensitive fields once reminder/message history exists.

## Validation

134 automated tests passed across the initial run and targeted reruns. Thirteen browser scenarios passed using isolated mock providers, including mobile/desktop widths, dates, persisted theme/list mode, search/filter retention, and payment confirmation. TypeScript and production build passed. No ESLint script/configuration exists in this repository.

The follow-up migration was applied to cashlance-test; anon/authenticated cannot execute it, service_role can, and RLS remains enabled. Local PostgreSQL tests cover ownership, permissions, history locking and cancellation of pending reminders when paid.

## Production procedure and rollback

Apply 20261001130000_edit_invoice_server, then 20261001140000_edit_invoice_customer_identity on vkhxpgkpmxgfcaaekdwu. Both only define/grant a function; neither rewrites data. Compare invoice/customer/reminder counts and fingerprints before/after and verify function permissions/RLS. Merge the reviewed PR only after its Preview is Ready; verify the resulting production commit and public read-only smoke tests.

If the application deployment fails, restore the previous production deployment (main 8da7af7). Leave additive SQL functions in place: the previous application does not invoke edit_invoice_server. No destructive SQL rollback is needed.

## Outstanding Stripe live verification

Only two test-mode Stripe connections are available. No live catalog, subscription or Portal configuration has been changed. Production Vercel price variables are:

- Solo: price_1UKgqAEeUQED7nKDyQmEuxmP
- Pro: price_1UKgqBEeUQED7nKDAxapy4OI
- Team: price_1UKgqDEeUQED7nKDBu3F5RGS

These identifiers alone do not establish live mode, amount or product. Before declaring billing ready, verify the live key/account, EUR monthly 19/39/79 prices, Switch plan, preservation of the remaining trial, period-end downgrades, and webhook synchronization. Stripe's Portal documentation specifies that period-end downgrades require prices belonging to the same product: https://docs.stripe.com/customer-management/configure-portal . Never substitute test prices for live prices or migrate existing subscriptions automatically. Scheduled cancellation is explicitly explained when change-plan returns that status; no real billing operation was performed in these tests.

No cron, real email, DNS change, or real payment is part of deployment verification. Physical iPhone/Android validation remains distinct from responsive Chromium tests.
