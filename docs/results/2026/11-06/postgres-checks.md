# Local PostgreSQL and usable canvas acceptance

Canvas now has explicit single-user local PostgreSQL persistence through standard
`pg`, in the isolated `inspiration_canvas_local` namespace. Local mode requires
operator opt-in and the app's loopback origin. Hosted Supabase remains the account
boundary. Files stay in the configured storage adapter; rows use native JSONB and
timestamps. Initialization is versioned, serialized and atomic, with no SQLite or
alternate database fallback. See [setup](../../../local-development.md).

The client now uses local server persistence for CRUD/crop/comments and identifies
that mode without showing account controls. Upload works with AI disabled.
The narrow toolbar wraps within the viewport. Comments preserve multiline input,
ignore canvas shortcuts while typing, reject stale reads across writes/session
changes, keep failed drafts, and isolate portalled menu clicks from card selection.

## Accepted results

- **55/55 unit and 16/16 real PostgreSQL cases** passed once on
  `a93eb1b5f2533fd12f2ef29b5206859a00dfc07f`,
  [run 42139409423](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/42139409423).
  [Original receipt and limits](postgres-checks-attempt-2.md) remain immutable.
  Later runs carry these results by receipt hash, twelve verified original
  streams and 159 unchanged prior inputs; the generated lock is bound separately.
  The client entrypoint and browser fixture were not executed by those core cases.
- **Two actual Chromium journeys passed together**, no retries/skips/flaky/global
  errors, on `91bcb251fbbda09520dd259be21cd5672c8cb7b9`,
  [run 42146307755](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/42146307755),
  job `127658505193`. Controller: 6 November 2026, 01:49:24–01:51:25 UTC.
  Both desktop 1440×1000 and narrow 390×844 used native file choosers, authored
  32×24 PNGs, real HTTP/PostgreSQL, literal comma-tags, crop, reload/rendering and
  owned UI deletion/reload. Desktop also typed exact multiline text, kept text
  selection inside the note, verified its actual 201 acknowledgement, delivered
  a held unchanged pre-write GET without an intervening newer read, and verified
  exact rendered text before/after that response and after reload.
- Frozen install, nineteen-file scoped ESLint and scoped TypeScript exited zero.
  One pre-existing canvas-load-ref hook warning remains. Sixteen complete original
  command/server streams decoded with matching sizes/digests. All 162 exported
  current runtime/test/config/lock inputs matched the native source independently.

The [current original receipt](postgres-checks.json) is **58,121 bytes**, SHA-256
`dd59a506063912851bd8cb6f2001ac2f5be11a6c1b61fcb0d29adc8464357c14`.
Source preservation, owned port release, marked disposable database drop, exact
process attribution/TERM-only shutdown, stream closure and scratch deletion all
passed. Provider container shutdown succeeded. Temporary CI is disabled/retired;
the normal source contains only its inactive template.

## Preserved failures and limits

[Attempts 1](postgres-checks-attempt-1.md), [2](postgres-checks-attempt-2.md),
[3](postgres-checks-attempt-3.md), [4](postgres-checks-attempt-4.md),
[5](postgres-checks-attempt-5.md), [6](postgres-checks-attempt-6.md) and
[7](postgres-checks-attempt-7.md) retain their exact failures and cleanup limits.
Attempt 3's residual process/scratch and unverified final stream closure remain
failures; later successful cleanup does not rewrite that evidence.

This is disposable PostgreSQL 17.6 and loopback browser acceptance with disabled
AI/hosted providers. Narrow is mouse/keyboard, not touch or physical-device proof;
its comment panel was not exercised. Readiness probes warm routes before browser
work, so cold-compile latency is not accepted. No real Supabase login/RLS/storage,
hosted persistence, account transition, model quality or complete Eve runtime is
proved. Vercel READY metadata is a separate publication boundary. Local installs,
builds and databases remained stopped by Storage Guard. The four-app portfolio
brief and full product goal remain unfinished.
