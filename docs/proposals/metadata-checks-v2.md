# Execute the prepared metadata browser checks

4 November 2026. The previous portfolio turn made delivery progress. Its next
ready local recommendation was this packet; current local and connected GitHub
main both match `62321812c0572b04d04f640395ce1383e2bf2f23`. All 175 original
prepared application fingerprints still match. No metadata browser execution
receipt exists. The owner repeatedly approved all necessary work and asked to
keep going, clearing the historical browser/temporary-CI question. No further
routine approval is needed for this exact scope.

The [original proposal](metadata-combobox-checks.md), inactive workflow,
[inventory](../results/2026/10-29/metadata-controls-inventory.json) and source/
publication receipts remain unchanged. The separate completed four crop cases
are not rerun or counted as metadata acceptance.

## Behavior and target

Run only `tests/e2e/metadata.spec.ts`: the same six 1440×1000 desktop and two
390×844 touch-emulated Chromium cases. They exercise explicit save/reload,
keyboard search/selection, literal case/comma tags and chip removal, clearing,
abandoned searches/media ownership, storage failure/retry and narrow controls.
Use the actual application and its real anonymous IndexedDB/localStorage mode.
Authored 32×24 PNG fixture data does not stand in for the system under test;
no application store/service or UI driver is replaced. The storage-failure case
temporarily faults only its own context's browser API and restores it.

Each case starts with empty browser state and Playwright owns its context
teardown. The existing automatic route fixture blocks and asserts every
non-GET/HEAD/OPTIONS request, recording `blocked-network-writes`. It does not
intercept every external read or WebSocket; do not describe it as a complete
loopback-only network sandbox. AI, Eve development, Blob and Supabase/provider
credentials are disabled/empty. The fallback SQLite path and upload directory
are task-owned, and must remain absent/empty: no backend initialization, database
setup, seed, migration or hosted upload is part of these anonymous flows.

## Execution and source boundaries

Use one standard public Ubuntu 24.04 job, Node 24.21.0/pnpm 10.24.0, capped at
fifteen minutes. The new inactive example invokes
`tests/scripts/run-metadata-checks.mjs`. Only `create` of
`qa/metadata-combobox-20261104` in this exact public repository can activate it;
checkout uses an immutable preparation SHA. Publish source commits with
`[skip ci]`. Do not activate the historical push example or overwrite another
branch. Remove the active temporary workflow after the terminal result and
retain only its own branch as a retired bookmark.

Install the unchanged frozen lock without lifecycle scripts. Lint only the
metadata control and its existing focused test. Install only Chromium and its
Linux dependencies. Preserve one worker, zero retries, 45-second cases, a
seven-minute Playwright deadline, 120-second fresh loopback Next development
startup and no screenshots, video or traces. No full Next build or broader
unit/browser suite is included. Use no secrets, new account, model call or paid
enrollment. Existing deployment and backend directions stay separate.

A new inventory at `docs/results/2026/11-04/metadata-checks-source.json` covers
all current application inputs, excluding `.agents/` and dated results just as
the old inventory did. Full HEAD/index/mode/working-byte guards additionally
cover every tracked leaf, including those excluded vendor/result files and the
new ledger. Only AGENTS/README status text differs in the original 175-input
set. Do not copy dependency folders, repository histories or old audit trees
into an evidence bundle.

## Finite work and truthful results

Bound work to 780 seconds, owned cleanup to sixty seconds and final stdout to
two seconds inside the fifteen-minute job. Bound every command's timeout and
stream capture, retaining at most 512 KiB per stream. A timeout, unexpected
signal, overflow, incomplete capture or missing stage prevents success. Keep
signal handlers active through cleanup/final output. Direct-child exit/close
and original process-group absence do not inventory separately detached browser
sessions; preserve that limit rather than invent global OS cleanup proof.

The [locked Playwright 1.61.1 runner](https://github.com/microsoft/playwright/blob/v1.61.1/packages/playwright/src/runner/tasks.ts#L252)
clears its output directory before tests. Keep ownership on a stable parent and
give Playwright a replaceable child; do not compare that child's inode to a
pre-run snapshot. The [Next 16.2.9 CLI guide](https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/06-cli/next.mdx)
confirms the retained development/hostname/port invocation; local Next guides
are absent while installation is blocked by Storage Guard.

Put tool/browser/compiler caches, temporary profile data, report/output and
fallback data paths under one owned root. The generated repository Playwright
config is create-only, identity/hash tracked and removed before the full final
source guard. Remove only task-created dependency/build/generated paths whose
ownership/current identity remain known. Refuse an occupied port before startup
and require the loopback server port closed after normal framework shutdown.
If forced termination leaves shutdown/storage ownership unverified, preserve
that failure and residue rather than count the eight cases as accepted.

Require a complete Playwright JSON report within 1 MiB, retain it losslessly
with a hash in the bounded result, and match exactly the original eight unique
names: Chromium, expected passed, one actual passed attempt each, zero global
errors/failures/skips/flaky outcomes. Verify the blocked-write evidence without
reading arbitrary attachment paths. Bound failure text by bytes (eight contexts,
at most 8 KiB each); diagnostic prefixes are not acceptance evidence. The final
controller report is capped at 256 KiB; no truncated report counts as a pass.
Retain failures before any evidence-supported same-scope repair/rerun.

Current local Storage Guard returned **22.6 GiB free / 34.0 GiB required**, exit
two. No local dependency installation, server, browser, build or database work
will bypass that reserve. A passing runner establishes these anonymous browser
behaviors, not signed-in/hosted persistence, real providers, physical touch,
native file-picker use, Safari, assistive technology or full product completion.
