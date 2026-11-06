# PostgreSQL browser diagnostics: original failures retained

[Run 42141661786](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/42141661786),
job `127643172168`, failed overall on source
`728deb07409038619d0f798bbeb90e1371718048` / activation
`e9fac978e5591dc48f64696adc7ff737d069ae26`.
It started 01:07:25 UTC on 6 November 2026 and was terminal by 01:09:16 UTC.

The accepted 55 unit/16 PostgreSQL cases were verified and carried without
rerun. All 160 remaining prior inputs and the installed lock matched; only the
previously unexecuted browser fixture changed for diagnostics. Frozen install,
scoped lint and TypeScript exited zero again. No application code changed.

Both browser journeys failed before acceptance:

- Desktop timed out waiting ten seconds for the upload response. It retained no
  actual response status or body, so the earlier server-log 200 is not an observed
  browser API-contract result. The guard blocked exact same-origin `GET /` with
  the single `_rsc` query key, followed by Next's stack-frame POST.
- Narrow timed out waiting ten seconds for the file chooser, with no write or
  denied request. Its exact button geometry/click outcome was not captured.

Next 16.2.9's pinned [router headers](https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/client/components/app-router-headers.ts),
[request builder](https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/client/components/router-reducer/set-cache-busting-search-param.ts)
and [hash implementation](https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/shared/lib/router/utils/cache-busting-search-param.ts)
identify `_rsc` as a legitimate App Router cache-busting read. This evidence
supports a narrowly bounded same-origin root GET allowance; it does not support
allowing the stack-frame POST or retroactively naming attempt 3's unknown URI.

Source review also found a genuine narrow-layout defect: the toolbar's ten
non-shrinking buttons, zoom label, separators and gaps exceed the 358px content
width at a 390px viewport. The unwrapped centered row is clipped by the canvas.
Wrapping that row is a product repair, but the precise chooser-timeout cause
remains unproved. Keep the native chooser, 201 contract, persistence/deletion
assertions and timeouts in the next attempt.

The [returned controller receipt](postgres-checks-attempt-4.json) is 63,906 bytes,
SHA-256 `5d34bc962c84694c491ee631a4cb65f7672e9d3860a47c7daa0dd31b2a8e9d44`.
All sixteen original command/server streams were independently decoded and
verified after attributed process closure. An owned Next CLI descendant was
identified by UID/start time/group/task cwd and stopped with TERM; no KILL was
needed. The server, port, marked database, source, stream closure and scratch
checks passed, with no final live or uncertain process. Service-container
teardown is separate provider evidence. No browser acceptance or production
rollout is claimed. The workflow is disabled and QA retired before replacement.
