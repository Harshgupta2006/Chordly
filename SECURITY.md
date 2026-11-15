# Security

Do not post credentials, private recordings or sensitive logs in public issues.
For a suspected credential exposure, revoke/rotate it with its provider immediately
and review its usage logs. Removing a file from Git does not revoke its contents.

## Implemented controls

- No external API keys are needed for bundled song matching or hosted inference.
- Environment files, deployment state and common private-key/credential files
  are ignored. A redacted credential-pattern scan checks source and reachable
  Git history in CI. Build-time checks reject secret-named `NEXT_PUBLIC_*` values.
- Production browser policy limits connections to the same origin (plus an
  explicitly configured HTTPS catalogue origin). It blocks JavaScript `eval`,
  embedding, plugins, foreign base URLs and foreign form submission. Source maps
  and the framework identification header are disabled. Microphone permission
  is restricted to this origin; camera and geolocation are disabled.
- Audio POSTs require the site's Origin, one multipart WAV, at most 2 MiB of
  audio, bounded total request bytes, 0.25–5 seconds, 8–192 kHz and at most eight
  channels. Content is decoded/validated rather than trusting filenames alone.
  Upload objects close after each request; no recording archive or database is
  created. Temporary multipart buffers may use the runtime's ephemeral storage.
- One inference runs per worker at a time; audio POSTs are limited to ten per
  minute per IP per worker. Client errors are generic; responses are not cached.
  The model loads once per warm worker with an integrity check. Only the bundled
  model can be loaded; clients cannot choose files, models or execution commands.
- The optional catalogue API validates inputs, sanitizes errors, restricts CORS
  and rate-limits matching. Production requires a read-only database URL with TLS.
  Docker's example database port is restricted to loopback.
- CI tokens have read-only repository permissions, checkout does not persist
  credentials, and third-party GitHub Actions are pinned to commit hashes.
  npm and hosted Python dependencies are audited in CI.

## Boundaries and remaining work

The site is a public prototype without login or personal server-side accounts.
An Origin check is not authentication: non-browser clients can forge it. In-memory
rate limits and concurrency limits apply per worker, not globally across Vercel
instances. Configure project-wide Vercel Firewall limits and spend controls before
opening the service to heavy traffic; account-level settings are not controlled
by this repository. No paid resource is provisioned by these source changes.

Inline scripts/styles remain allowed for Next.js hydration and existing styling.
A nonce-based CSP would require a deliberate rendering/cache change. The current
policy is stronger than the previous policy but is not a complete XSS prevention
guarantee. Keep React text escaping and avoid rendering untrusted HTML.

The development PostgreSQL passwords in Docker/SQL examples are already public
and must never be reused for hosted services. `.env.example` is documentation,
not a secret store. Do not add private keys to `NEXT_PUBLIC_*`, `public/`, notebook
outputs, logs, screenshots, README examples or `.gitignore` itself. Provider
secrets must stay server-only in Vercel Secret variables or ignored local files.

Automated checks reduce risk but cannot prove the absence of every vulnerability
or secret, inspect provider usage history, or revoke old credentials. Review
GitHub secret scanning alerts and Vercel account/team settings directly when
administrator access is available. Browser microphone behavior needs a physical
device check in addition to API and automated tests.
