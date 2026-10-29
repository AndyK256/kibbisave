# Architecture

Flutter Windows/Linux widgets → CompanyApi HTTPS session → Express tenant/role authorization → existing Neon database.

Google sign-in opens the website's external browser. An authenticated account explicitly approves a displayed code. The desktop must present the matching private verifier to exchange that approved request once. Expiry, cancellation and replay checks run in the database, so multiple serverless instances share state. The browser approval key is placed in the URL fragment and removed from history after parsing. Sessions remain in desktop memory only.

Every company API request checks approved membership and revocation. Company administration supports manager/CEO only; manager invitations and custom terms require the CEO. Invitations are bound to the recipient's signed-in email and approved seat limits. Custom plan requests never take payments or grant additional seats by themselves. One CEO owns each company.

Actual approved deposit requests feed idempotent organization cash receipts. A separate daily-allocation ledger distributes advances without double counting. Historical reporting uses the assigned admin on the report date and excludes receipts recorded later. New deposit contacts and pending requests move on confirmed reassignment; historical cash stays with the collector. Trash preserves financial records and revokes access.

Staff direct messages are company-scoped. Client/community conversations use the same endpoints as the customer and KibbiAdmin apps. Sender roles are server-derived; no client can claim CEO/manager by changing a colour.

Company verification and agreed custom terms require a trusted human operator; no company identity or account privilege is fabricated during setup. This app does not hold provider keys or connect directly to Postgres.
