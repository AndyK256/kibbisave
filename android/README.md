# KibbiSave native Android apps

Version 0.4.0 recreates the live `https://kibbisave.com` consumer UI and the deployed `/admin/` interface using Kotlin Android Views. There is no WebView or embedded website. The visual reference is the Vercel production deployment `dpl_9Q14AQJBR4iAodGRdbsEh6q6BuzG`.

## Website design and navigation

The native screens use the website's #00008b brand color, DM Sans font, original illustration assets, rounded savings panels, progress indicators, community categories, five-tab consumer dock and five-item admin dock. The website Google mark is packaged as an Android vector. Original DM Sans licensing is included in assets/fonts/OFL.txt.

Consumer tabs: Profile, Leaderboard, Analytics, Groups, Communities. Admin tabs: Profile, Communities, Home, Approvals, Register. Guests can browse the public dashboard, groups, leaderboard and communities; protected actions require an authenticated session.

## Native screens and API flows

- Password and Google sign-in; user/admin registration forms; native verification photo capture for admin registration.
- Consumer dashboard, open/private group tabs, group filtering, details and member standings, group creation with invite sharing/copying, joining with a code, and deposit-request forms.
- Public/private/organisation/donating community categories, community creation, community standings and messages, member profiles, search, and group messages.
- Profile, avatar selection, personal details, payment-method management, savings history, activity, notifications, saved settings and dark theme.
- Admin collection dashboard, community creation, member lists/detail, registration, received-deposit form, pending requests/PIN approval, history and PIN changes.
- Native legal/help text packaged from the deployed website. Third-party social links and external account URLs open the browser explicitly.

The app calls the existing production API; it does not use sample savings records. Backend role and permission checks remain authoritative. API fields and route contracts were read from the deployed backend source.

## Authentication

Google sign-in uses Android Credential Manager and the website's existing web client ID, with server-issued challenges and backend identity-token verification. Both Android package names must be registered in the same Google Cloud project with the APK signing certificate. The native Google endpoint currently requires completed website onboarding and existing admin KYC/PIN setup; Google accounts that have not completed those steps receive the server's setup instructions.

App IDs: `com.kibbisave.app` and `com.kibbisave.app.admin`. Each app keeps its own encrypted session. No passwords or PINs are saved. GitHub Actions restores the stable test certificate from `KIBBISAVE_DEBUG_KEYSTORE`; release signing remains separate.

## Financial and offline behavior

The consumer app offers cash, MTN MoMo and Airtel requests. These create pending admin requests; they do not charge a mobile-money account. Admin confirmation requires receipt acknowledgement and the server-verified PIN. No write is queued or automatically retried. An uncertain money-changing result leaves a persistent reminder until the user checks the server result. Profile/session refreshes retain that reminder.

User home/my-groups/history reads can be saved in AES-GCM encrypted storage for up to 24 hours during a locally valid session. Admin and message data are not saved offline. HTTP 401 clears the local session; protected data is never substituted from cache after authentication failure. Sign-out clears local data. Financial processing and concurrent backend approvals still require separate test-money validation.

## Build and validation

JDK 17, Gradle 8.13, Android SDK 36 and build tools 35.0.0. The Android APK workflow runs unit tests, compilation, lint, debug APKs and unsigned release bundles for both flavors. See VALIDATION.md for the latest verification and its limits.

Native layouts intentionally render using Android controls. They do not automatically inherit later website UI changes. Visual parity and authenticated flows should be reviewed on real devices before distribution.
