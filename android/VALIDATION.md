# Native website UI validation

## Confirmed

- Production reference: `https://kibbisave.com`, including its `/admin/` interface, verified with Vercel inspect.
- Website home, mobile login, groups, guest profile/account sheet, community category cards and admin dashboard inspected in the browser; deployed HTML/CSS/JS and API handlers inspected for the remaining routes.
- Original website illustrations, DM Sans font/license and Google logo used in native resources.
- Previous native redesign build `39401486299` passed compilation, unit tests, lint and artifact generation for both flavors. Final UI/resource refinements are verified by the subsequent workflow run linked in the delivery.
- Unit coverage includes offline expiry, origin/path boundaries, amount validation and unresolved-result protection for consumer deposits, admin approvals, manual deposits and member registration with an opening balance.

## Limits

- Matching native layouts have not been established to be pixel-identical to every website page/state. Native app windows are not exposed to the browser inspection tools in this session.
- Successful Google/password sign-in, account creation, KYC photo capture, notification/settings persistence and admin role-specific flows require a test account/device review.
- No real deposit, member opening balance, ledger approval, community creation/deletion or other production write was submitted during this UI work.
- Backend transactional idempotency and concurrent approvals remain separate backend concerns. The UI retains pending-result protection and never fabricates a successful financial response.

## 25 October 2026 parity pass

Re-fetched all 22 previously captured production HTML/CSS/JS references; contents were unchanged. Measured the live mobile site at 393 × 800 CSS pixels and inspected home, sign-in, account overlay and groups. Matched shared header dimensions, original SVG navigation paths and logo, native progress tracks, group-card hierarchy, guest account grouping/accordions, consumer sign-in and registration structure. CSS surfaces are recreated with Android paint rather than a WebView.

This is a parity improvement, not a claim of zero differences. Remaining verification requires screenshots of the native apps at the same viewport/font scale and authenticated website/app states. In particular, community/detail/admin screens and form dropdowns still need an exhaustive comparison; native system dialogs and Google account selection intentionally use Android controls. No production financial requests or account creation were performed.
