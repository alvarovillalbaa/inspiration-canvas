# Metadata combobox browser checks, pending approval

29 October 2026. **Eight authored cases; no browser execution yet.**
This new scope is separate from the completed four-case crop acceptance.
The supplied AGENTS.md sections 7 and 14 require explicit browser/temporary-CI
approval. Source publication and normal existing Vercel delivery are already
authorized by the owning all-project request.

## Exact scope

Run only tests/e2e/metadata.spec.ts: six desktop cases and two narrow-screen
touch cases in one Chromium project. The [inventory](../results/2026/10-29/metadata-controls-inventory.json)
freezes the exact eight names and source hashes. Cases exercise new-value
creation with explicit save/reload, keyboard filtering/selection, literal
case/comma-containing tags and chip removal, clearing, abandoned search/media
draft ownership, controlled local-storage failure/retry, and narrow controls.
The actual full application is used; no substitute component or driver is
presented as browser acceptance. The inventory covers tracked application inputs,
excluding dated results (self-reference) and bundled .agents/ skills (unrelated
vendor instructions). Those existing bundled files remain unchanged.

Each case owns an empty browser context, generated tiny PNG pixels and temporary
browser storage. A request guard blocks and records every non-GET/HEAD/OPTIONS
request, and cases require an empty blocked-write list. There is no sign-in,
production browser, hosted upload, real document, database setup, provider/model
call, migration, secret, account or paid service. Chromium-emulated touch is not
physical-device or Safari proof. Playwright file injection does not establish
operation of the owner's native file picker.

## Temporary CI

After approval, create qa/metadata-combobox-checks from the exact published source
and install the [inactive example](metadata-combobox-ci.yml.example) as
.github/workflows/metadata-combobox-checks.yml on that branch only. Replace its
APPROVED_SOURCE_COMMIT placeholder with that full reviewed SHA. Only a push that
changes this workflow on the exact branch triggers execution; the job also
requires this canonical public repository. Checkout uses the pinned source, not
the workflow branch's mutable application files. Never install it on main.

One standard public Ubuntu 24.04 job is capped at fifteen minutes. Checkout and
Node setup use full official commit pins. Node 24.21.0 and pnpm 10.24.0 match the
previous reviewed scope. Install the existing frozen lock without lifecycle
scripts, lint only the new component and focused test, and install only Chromium
plus its Linux dependencies. No lock regeneration, dependency version change,
larger runner, package/browser cache or uploaded artifact is included.

The runner generates a temporary Playwright config: one worker, zero retries,
45-second cases, seven-minute global deadline, no screenshots/video/traces, and
a fresh loopback Next development server. AI/Eve development, hosted storage,
Supabase and provider credentials are explicitly disabled/empty. No full Next
build or broader unit/browser suite runs. The source seal is checked before and
after. Structured results must contain precisely eight unique one-attempt passes
and zero failures/skips/flaky/global errors. Missing stages cannot count as pass.

Only bounded authored failure-context text and a concise JSON result summary go
to the public job log. The JSON report is capped at 1 MiB; excess/missing evidence
fails. There are no uploaded artifacts. After terminal inspection, persist the
source/run/conclusion and all actual counts in owning results, including failed
attempts. A bounded repair may rerun the same approved cases with updated source
hashes and retained failure evidence; scope/budget expansion needs new approval.
Remove the active workflow from the maintenance branch even after failure and
verify its removal. Playwright owns its temporary server/context shutdown;
hard runner termination can leave an incomplete result and is not acceptance.

The local Storage Guard preflight reports 28.0 GiB free versus 34.0 GiB required;
no local installation, server or browser bypasses it. A passing job still leaves
signed-in persistence, real providers, physical touch, assistive technology and
the existing all-project PostgreSQL migration direction separately unfinished.
