# Native Kotlin validation status

## Confirmed in the editing workspace

- Android manifest, flavor manifests, vector icons, strings, and theme files parse as XML.
- GitHub Actions workflow parses as YAML and contains separate user/admin build, test, lint, and artifact paths.
- The native source replaces the browser launcher; no browser-rendering dependency remains in the build.
- The native upload contains only Android project files and its workflow, preserving the newer deployed website code.
- Public endpoint checks: `https://kibbisave.com/api/auth/me` returns HTTP 200 with `authenticated:false`; the protected `/api/admin/me` route returns HTTP 401. That admin route is HTTP 404 on `kibbi-admin.vercel.app`.
- API request/response shapes were inspected in the deployed-branch backend source at commit `3909e602ce4d2bd2f55232590d8ad5328758dcb1`.

## Not yet verified

- Kotlin compilation, Android lint, and the eight JVM tests in `DomainTest.kt`. The workspace has no Kotlin compiler, Gradle, or Android SDK; its configured network proxy cannot download them.
- Installation and UI behavior on a real Android device or emulator.
- Successful user/admin sign-in, revoked sessions, real data rendering, Keystore persistence, and offline/rotation/device-restart behavior.
- Deposits, approvals, incorrect PINs, uncertain responses, and concurrent operations against a test financial backend. No money-changing requests were sent.

The GitHub workflow runs the JVM tests and compilation/lint gates once these files are uploaded. It does not run device tests or validate the financial backend.
