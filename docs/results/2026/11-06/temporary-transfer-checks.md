# Temporary canvas account-save repair

The previous flow skipped missing blobs, ignored metadata/comment HTTP failures
and then erased the browser copy. The repair creates complete imported items,
resumes deterministic media/comment identities and retains recovery data until
the original expiry. It also prevents stale canvas loads or transfer completion
from restoring signed-in UI after a newer auth transition.

## Checked source and result

- Source: [`6244adbbf8b911c69d74f79c4a8a7ede499c7706`](https://github.com/alvarovillalbaa/inspiration-canvas/commit/6244adbbf8b911c69d74f79c4a8a7ede499c7706).
- Temporary QA activation: `802d93070a2929542225836ce015756be33f6f87`.
- [GitHub run 42134949204](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/42134949204),
  job `127620605732`, succeeded on 6 November 2026, 00:11:08–00:11:53 UTC
  (45 seconds; controller 35.307 seconds), within the 15-minute job limit.
- **29/29 authored checks passed**: 14 import/API boundary cases, 12 client
  transfer cases and three recovery-receipt cases. No failures or pending cases.
- Frozen `pnpm@10.24.0` install with lifecycle scripts disabled; focused Vitest,
  scoped ESLint and scoped `tsc --noEmit` all exited zero. No dependency or lock
  change. TypeScript emitted no diagnostics.
- ESLint reported zero errors and one `react-hooks/exhaustive-deps` warning at
  the cleanup's generation-ref increment. The ref is an integer request counter,
  not a DOM ref; its current value intentionally invalidates outstanding loads.
  The warning is retained without disabling a check or changing lint policy.

## Evidence and cleanup

The original controller receipt is [temporary-transfer-checks.json](temporary-transfer-checks.json),
31,220 bytes, SHA-256 `ec59b0135b787e3ab572ac3d1897672dc40a594a2029988d431d1ddcd2d9b2cb`.
Root independently decoded and verified all eight complete stdout/stderr streams,
their lengths and digests, and all 145 exported source hashes against the native
checked source. The runtime export was 1,228,358 bytes and excluded Git history,
existing dependencies and old audit trees. Source guards passed after commands.
No owned processes remained before or after cleanup, and the exact disposable
scratch directory was removed. Temporary workflow `408782297` was disabled
manually after the successful run; its active copy is retired from the QA head.
Only the inactive template and runner remain for a separately scoped future use.

## Limits

Persistence/storage SDK calls are authored boundaries. These checks are not a
real Supabase database, RLS test, storage durability test, login or browser UI
acceptance. The auth-generation interleavings received source review, not a new
browser scenario. No app server, database, browser, provider/model call, new
account or paid plan was used. Local installation/build was skipped because
Storage Guard measured 19.4 GiB free against the required 34.0 GiB reserve plus
estimate. Existing crop/metadata evidence is unchanged.

Storage and rows remain separate writes; deterministic keys make partial work
retryable rather than atomic. Changed source content under an already imported
identity returns a visible conflict, and saving does not extend temporary expiry.
The broader local PostgreSQL migration and live signed-in acceptance remain open.
