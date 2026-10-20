# Native Kotlin apps for KibbiSave

This is the first native Android implementation, replacing the earlier Java/browser-backed launcher. The screens are Android Views written in Kotlin; there is no WebView, Trusted Web Activity, or browser-rendered dashboard.

## Two apps

| App | Package ID | Native API default |
| --- | --- | --- |
| KibbiSave | `com.kibbisave.app` | `https://kibbisave.com` |
| KibbiSave Admin | `com.kibbisave.app.admin` | `https://kibbisave.com` (`/api/admin/*`) |

Both can be installed on one phone. Each keeps a separate session, encryption key, and private app storage. Signing in on the website does not sign in the native apps. The separate `https://kibbi-admin.vercel.app/` address remains an admin **website**, not the default API host.

API contracts were inspected from the deployed user-site commit `3909e602ce4d2bd2f55232590d8ad5328758dcb1` in `AndyK256/kibbisave`, which has newer authentication and admin routes than the original uploaded ZIP. Public checks returned HTTP 200 for `/api/auth/me` with `authenticated:false`, HTTP 401 for the protected `/api/admin/me`, and HTTP 404 for that same API path on the separate admin website. These checks do not verify actual account login or financial processing.

Do not overwrite the newer live website with the old ZIP contents. Use the **native-only update ZIP**, which contains only `android/` and `.github/workflows/android.yml`.

## Implemented native screens

**User:** password sign-in, savings dashboard, my groups, open groups, join/create group forms, deposit-request form with confirmation, savings history, account/logout, and offline-data controls.

**Admin:** password sign-in for existing verified admins, approved collections dashboard, community overview, pending deposit requests, receipt acknowledgement and PIN-confirmed approval, approved transactions, and account/logout.

The server is responsible for access control. An admin APK grants no privileges. The current admin API requires completed KYC and an approval PIN. An ordinary account is not allowed to use privileged endpoints merely because it signs in to this app.

This first native version uses existing password accounts. Native Google sign-in, registration/KYC, profile editing, member onboarding, camera uploads, messaging, withdrawals, push notifications, and biometric unlock are **not yet implemented**. Account setup buttons open the existing websites explicitly. A Google-only account without a backend password cannot sign in to this native version yet. No demo accounts or fake financial data are included.

## Offline data

- The user app saves successful home, my-groups, and savings-history reads in AES-GCM encrypted storage, with a key held by Android Keystore.
- A saved response belongs to the current account and API origin. It can be read only during a locally valid session, and for at most **24 hours after that screen was synced**.
- Native offline pages show a saved-data label and last-sync time. Values may have changed on the server. Screens that have never synced cannot be read offline.
- A server authentication/authorization error is never replaced by cached data. The app clears the local session on HTTP 401 and discards snapshots on HTTP 403.
- Sign-out, account changes, expired sessions, or clearing saved data removes offline access. Device backup is disabled. Sensitive screens block system screenshots.
- No admin data, PINs, passwords, identity-document images, API write requests, or approval lists are cached. Admin screens and actions require internet.
- There is no background transaction queue or automatic retry of writes. After an uncertain payment result, the app records a reminder and blocks another payment action until the user checks the live result. That reminder is not a queued transaction.

Offline access cannot discover a server-side account revocation while disconnected. The local session expiry and 24-hour snapshot limit bound offline availability. Android screen-lock protection remains important for anyone with physical access to an unlocked phone.

## Deposit semantics

The user app sends only `cash`, `mtn_momo`, or `airtel` deposit requests to `/api/deposits`. In the inspected backend these create pending admin requests; they do **not** charge mobile money or confirm receipt. The app describes the result as a request, not a completed transfer.

Admin approval requires a current network response, explicit acknowledgement of payment receipt, and the existing four-digit server-verified PIN. A confirmation response is required before success is shown. Passwords and PINs are held only temporarily in memory.

The existing backend does not expose an idempotency-key contract. Client-side duplicate protection is not a substitute for server-side transactional idempotency. The inspected approval handler performs ledger confirmation and approval-status update as separate operations; concurrent approval and partial-failure behavior must be reviewed/tested on the backend before production financial use. No real deposits or approvals were performed during development.

## Build free APKs

Requirements: JDK **17**, Gradle **8.13**, Android SDK platform **36**, build tools **35.0.0**. Set `ANDROID_HOME`, or create ignored `android/local.properties` with `sdk.dir=/absolute/path/to/Android/sdk`.

From `android/`:

```sh
gradle :app:testUserDebugUnitTest :app:testAdminDebugUnitTest
gradle :app:assembleUserDebug :app:assembleAdminDebug :app:lintUserDebug :app:lintAdminDebug
```

APK outputs:

- `app/build/outputs/apk/user/debug/app-user-debug.apk`
- `app/build/outputs/apk/admin/debug/app-admin-debug.apk`

The GitHub **Android APK** workflow runs native unit tests, compiles and lints both flavors, and uploads **kibbisave-user-native-apk** and **kibbisave-admin-native-apk**. It needs no database secrets or API keys. The default API origin is already configured.

To override API hosts, use Gradle properties `kibbisaveApiUrl` and `kibbisaveAdminApiUrl`, or GitHub Actions repository variables `KIBBISAVE_API_URL` and `KIBBISAVE_ADMIN_API_URL`. These must be HTTPS origins, not website dashboard paths. Verify the target backend implements the endpoints below before changing them.

Gradle and the Android SDK were unavailable in the editing environment, and its network proxy could not download dependencies. **The Kotlin apps and their JVM tests have not been compiled or executed here.** The included CI workflow is the next compilation and lint gate. No installable native APK is included yet. A Gradle wrapper binary could not be downloaded; generate it locally with `gradle wrapper --gradle-version 8.13` if desired.

Direct APK installation is free. CI runners generate temporary debug signing keys; APKs from different runs may require uninstalling an older debug app first, which removes its saved data. Use a securely retained signing key for stable updates and later distribution. The package IDs remain unchanged, so the earlier browser launcher is replaced rather than installed as a third/fourth app.

## Existing backend endpoints used

| Action | Method | Path |
| --- | --- | --- |
| User sign-in | POST | `/api/auth/login` |
| Admin sign-in | POST | `/api/admin/login` |
| Sign-out | POST | `/api/auth/logout` |
| User dashboard / open groups | GET | `/api/home` |
| My groups | GET | `/api/groups/mine` |
| Create group | POST | `/api/groups` |
| Join group | POST | `/api/groups/:id/join` |
| Request deposit | POST | `/api/deposits` |
| User savings history | GET | `/api/profile/history` |
| Admin dashboard | GET | `/api/admin/home` |
| Admin communities | GET | `/api/admin/communities` |
| Admin approved history | GET | `/api/admin/transactions` |
| Admin pending requests | GET | `/api/admin/approvals` |
| Admin approval | POST | `/api/admin/approvals/:id/approve` |

Authentication uses the existing HttpOnly `kibbisave_token` session cookie, stored encrypted by the app and sent only to its configured HTTPS API origin. The app never follows API redirects or imports browser cookies. The original uploaded ZIP's backend does not contain all these routes; the already-deployed newer backend does.

## Validation before distribution

1. Compile both APKs and run all JVM tests and Android lint in CI.
2. Install both on a real device; verify separate names, icons, and sessions.
3. Test user password login, expiry/401 handling, and sign-out clearing data.
4. Sync home/groups/history, disconnect, reopen, check timestamps and read-only behavior, then reconnect and refresh. Test clearing snapshots and changing accounts.
5. Confirm ordinary users are denied admin access; test PIN rejection and role revocation against the backend.
6. On a test backend with test money only, check deposit-pending semantics, approved history, uncertain network outcomes, duplicate submissions, and concurrent approvals.
7. Test rotation, Android Back navigation, network loss, and app restart while a request is in flight.

For later Play releases, configure the existing `KIBBISAVE_KEYSTORE`, `KIBBISAVE_STORE_PASSWORD`, `KIBBISAVE_KEY_ALIAS`, and `KIBBISAVE_KEY_PASSWORD` environment variables, then run `gradle :app:bundleUserRelease :app:bundleAdminRelease`. Without signing variables, CI release bundles are unsigned and cannot be published. Domain verification is not required for these native screens; the older `android/scripts/assetlinks.mjs` utility is retained only for the legacy browser build and is not used by the native app.
