# Metadata browser checks — eight passed

5 November 2026 local. [Attempt 4's canonical receipt](../results/2026/11-05/metadata-checks.md)
and [machine result](../results/2026/11-05/metadata-checks.json) record **eight of
eight passed**, once each, in [run 41933509907](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/41933509907),
job `126936070253`. The immutable checked source was
`d817a5b99503748b1cbfc0aaaf624962f180a58c`, tree
`2c914cee9eceedf9171514e087e530f705ff55a2`; activation was
`2460d0cb9afa2d2365f863206a3f62be7b0aa13f` on the owned QA branch.

The same six desktop and two touch-emulated Chromium cases passed with zero
retries, skips, flaky outcomes or global errors. All 48 commands exited normally
with complete bounded capture; six full guards passed over 178 application
inputs / 1,357,361 bytes and all 1,033 tracked leaves. The port was unbound,
no application database/upload file appeared, and cleanup passed: five known
generated roots, including SWC, and the owned scratch root were removed; final
ignored output was empty. Playwright owns browser shutdown; separately detached
sessions were not independently inventoried.

This closes the authored anonymous metadata scope, not signed-in persistence,
hosted providers, physical touch, Safari, assistive technology or the full
product. Final publication retires the QA-only activation and changes only
README plus this status document among the 178 checked inputs: the other 176,
including product, fixtures, controller and lock, remain byte-identical. Reproduce
the immutable checked source above; earlier failures and inventories stay intact.

5 November 2026. [Attempt 1](../results/2026/11-04/metadata-checks-attempt-1.md)
failed at focused lint before Chromium installation or any browser case ran.
React's hook rule interpreted the Playwright fixture callback named `use` as a
hook inside `try/finally`. Attempt 2 renamed only that callback and its call to
`runFixture`; every scenario name, action and assertion remained unchanged. The
failure receipt and first QA branch's retirement are preserved at
`41b01d396de18cf9c8d1f1fc7646d60c8aa0f017`. The owner repeatedly approved all
necessary work and asked to keep going; no further routine approval is needed
for this same eight-case scope.

[Attempt 2](../results/2026/11-04/metadata-checks-attempt-2.md) ran all eight cases
once: zero passed and eight timed out. Five desktop cases lost their panel
locator after a popup opened; two touch cases did not select media, and the
remaining desktop case hit overlapping-media pointer interception. Full source
guards passed, but unexpected ignored output left cleanup unverified and the
owned scratch retained. Its receipt and retirement are preserved at
`df87d7cffbd25981ebc2e40c0d662dd6fa72c9ef`.

[Attempt 3](../results/2026/11-05/metadata-checks-attempt-3.md), checked source
`59f29ac3cf51ae4030290e83b121ec2165728cb2`, ran the same eight cases once:
seven passed and one failed. Both touch cases and the earlier popup/switch
failures passed. The remaining tag case showed `Research, notes` in the input
but only selected `Design`/`design` options. Cleanup remained unverified because
the generated SWC cache was outside the known-output list. Its failure and
retirement remain at `7922ef79e9ad7bc1191b2e8433c84564d3521b14`.
Attempt 4 passed as recorded above; it changed no fixture, assertion or timeout.

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

The [locked Base UI 1.6.0 popup](https://github.com/mui/base-ui/blob/v1.6.0/packages/react/src/combobox/popup/ComboboxPopup.tsx#L120)
uses modal focus management for an input outside its popup. Its
[focus manager](https://github.com/mui/base-ui/blob/v1.6.0/packages/react/src/floating-ui-react/components/FloatingFocusManager.tsx#L571)
temporarily hides unrelated controls from the accessibility tree. The Media info
panel now has a named complementary landmark; its fixture anchor no longer
depends on the temporarily hidden Close info button. The existing Escape after
tag creation precedes the unchanged outside-popup chip assertion. Exact field,
option, chip and close-action selectors and every case assertion remain intact;
no primitive modal override or vendor change is proposed.

The [locked primitive's close/reopen logic](https://github.com/mui/base-ui/blob/v1.6.0/packages/react/src/combobox/root/AriaCombobox.tsx#L541)
can retain a frozen closing query when an outside-input popup is reopened before
its exit finishes. The tag snapshot is consistent with that stale filter, not
a general comma-splitting failure; other comma-containing tags passed. Both
metadata filters now close over the same current controlled query that builds
their create option. The public filter callback changes with that query, which
the primitive includes in its filter dependencies. This preserves exact-case
selection identity and literal commas without a wait, motion override or vendor
patch. During the brief closing phase, the cleared input may reset the displayed
options immediately instead of retaining the old filtered list.

Touch selection now runs through the existing Rnd touch-start callback, keeping
an existing selected group. The locked [react-draggable handler](https://github.com/react-grid-layout/react-draggable/blob/v4.7.0/lib/DraggableCore.tsx#L333)
prevents the compatibility click on touch start; mouse selection is unchanged.
The normal right-click fixture point moves from 8 to 24 CSS pixels, outside the
corner resize handle and within the exposed upload strip at the observed 2x
desktop scale. The [resizer source](https://github.com/bokuweb/re-resizable/blob/master/src/resizer.tsx#L19)
was inspected from a tree declaring 6.11.2; a matching version tag/npm artifact
was not verified. Playwright's real hit testing remains enabled.

Attempt 2 retained only hashes of ignored-status output. Attempt 3's bounded
diagnostics identify `.swc/.gitignore` and `.swc/plugins/`; its 109-byte
pre-cleanup and 36-byte final status hashes match attempt 2. Attempt 4 permits
only these observed ignored rows and cleanup of a pre-absent, identity-captured,
nonsymlink `.swc` directory. Other unexpected output still fails and remains
outside cleanup authority. These status hashes are not cache-content hashes.

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
`qa/metadata-combobox-20261105-4` in this exact public repository can activate it;
checkout uses an immutable preparation SHA. Publish source commits with
`[skip ci]`. Do not activate the historical push example or overwrite another
branch. Remove the active temporary workflow after the terminal result and
retain only its own branch as a retired bookmark.

Install the unchanged frozen lock without lifecycle scripts. Lint only the
metadata control, the changed canvas component and the existing focused test. Install only Chromium and its
Linux dependencies. Preserve one worker, zero retries, 45-second cases, a
seven-minute Playwright deadline, 120-second fresh loopback Next development
startup and no screenshots, video or traces. No full Next build or broader
unit/browser suite is included. Use no secrets, new account, model call or paid
enrollment. Existing deployment and backend directions stay separate.

A new inventory at `docs/results/2026/11-05/metadata-checks-source-attempt-4.json` covers
all current application inputs, excluding `.agents/` and dated results just as
the old inventory did. Full HEAD/index/mode/working-byte guards additionally
cover every tracked leaf, including those excluded vendor/result files and the
new ledger. The original 175-input set differs in AGENTS/README status text,
the named landmark/touch selection in `components/canvas/inspiration-canvas.tsx`,
the current-query filters in `components/canvas/metadata-combobox.tsx`, and the
earlier documented fixture repairs in `tests/e2e/metadata.spec.ts`. Earlier
source ledgers remain immutable. Do not copy dependency folders, repository
histories or old audit trees into an evidence bundle.

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
