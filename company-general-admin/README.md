# KibbiSave General Admin — Flutter desktop

Company monitoring app for Windows and Linux. It is separate from the Kotlin customer and KibbiAdmin apps and uses their existing authenticated backend/database.

## Features

- Google sign-in through your system browser: compare the code and approve, then return to the desktop. An expiring, single-use proof exchanges for an in-memory session; no browser-cookie copying or embedded Google login.
- Existing email/phone and password sign-in, immediate local logout, and an assistance form.
- Company registration and verification status, approval of consenting KibbiAdmins, ranked administrators and client portfolios.
- Daily, weekly, monthly and custom date ranges. Actual cash, expected contributions and recognized advances stay separate. Historical reports use assignment history and exclude later payments.
- Confirmed same-company portfolio reassignment, new deposit-contact routing, full profiles, recoverable admin trash and session revocation.
- Company staff, email-bound manager invitation codes, configurable approved seat capacity, removal/re-invitation, job titles and an activity log.
- Custom plan requests: currency, amount, billing period, manager seats and negotiated notes. Requests do not charge money or activate seats. A trusted operator verifies the business and approves agreed terms.
- Role-filtered staff/customer/community messaging, formatted bubbles, inline replies, Enter to send, Shift+Enter for a newline, and newlines inside code fences. Customer light blue, KibbiAdmin light pink, manager light orange, CEO light red.

## Run and build

```
flutter pub get
flutter analyze
flutter test
flutter run -d windows
flutter build windows --release
```

Use `-d linux` / `flutter build linux --release` on Linux with the Flutter build tools. Executable: `KibbiSaveCompany.exe` on Windows or `KibbiSaveCompany` on Linux. Distribute the entire release bundle, including its lib/data files. Windows builds require Windows with Visual Studio C++ desktop tools. The repository workflow builds and packages both targets.

The production API defaults to https://kibbisave.com. For another trusted deployed backend, build with `--dart-define=KIBBI_API_URL=https://your-api.example`. The app accepts HTTPS origins only. Never put database credentials, session cookies, or OAuth secrets in build defines or the app.

## Company onboarding

Sign in and register the real company. The operator verifies the business before it appears in the admin directory. Request customized terms; approved manager seats become available after the terms are reviewed. An aspiring KibbiAdmin selects the verified company and consents to sharing the KYC summary; the CEO/manager then approves that request. Metrics populate from actual assigned portfolios and approved collection records. No demonstration money or fabricated memberships are supplied.

A CEO can copy an invitation code and share it with the intended manager. The manager signs in with the invited email and chooses Accept invitation. Codes expire after seven days. No invitation emails or private messages are sent automatically.

## Operations and verification

Backend schema and release notes are tracked separately in the backend project. `scripts/company-operations.cjs --help` documents business verification and custom-plan approval for trusted operators. These commands use server-side database access and never belong in the desktop bundle. Approval of custom terms is configuration, not a payment transaction. Assistance requests are saved for follow-up; the one-hour response wording is a target, not a guarantee.

Automated fixtures are isolated tests, not real company records. Windows executable signing and real-account company acceptance require their respective production identities; do not treat an unsigned portable build as a signed installer. Check release verification notes for the exact build/deployment results.
