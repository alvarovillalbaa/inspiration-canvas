# Visual crop repair

27 October 2026. This is a focused repair of the existing Inspiration Canvas, not completion of every item in its product queue.

## Intent and baseline

The active personal queue links [Inspiration Canvas's product feedback](https://app.notion.com/p/3b6a1ee8bd06803e99d1cf6b0218c207), whose crop QA asks for drag-and-drop cropping. The related screenshot block is `3b6a1ee8-bd06-80e2-9a45-feff4ef124b0`; the inspected response did not expose the text-heading block ID. Source baseline is [`f28af6c3699b54ec53c2a0052b2a01846ced3875`](https://github.com/alvarovillalbaa/inspiration-canvas/commit/f28af6c3699b54ec53c2a0052b2a01846ced3875).

That baseline offered four numeric crop fields without an image or handles. Pure execution of its immutable crop helper also reproduced `normalizeCropJson({})` returning four `NaN` fields; an explicit nonfinite coordinate was accepted. The existing normalized `cropJson` format, file ownership and save endpoint are retained.

The existing Vercel project is `prj_uND96E27Awaq5OhYjJ3YKDWawZhq` in team `team_JpdIsOJgYNpX0ywVZ54Zdb7m`. Its production deployment `dpl_7J8gpnoKWLX62x1LzQB5cVfym3v7` matched the baseline commit and reported `READY`. A read of [inspiration-canvas.vercel.app](https://inspiration-canvas.vercel.app) returned HTTP 200. That is baseline availability, not crop interaction proof.

The new checkout was initially clean and bounded to source (repository metadata 2,890 KiB; inspected tree about 7.56 MiB of blobs). No dependency installation or local application build occurred. Repo `AGENTS.md` and `CLAUDE.md` were read. Installed Next documentation was absent; the [official guide pinned to the project's Next 16.2.9](https://raw.githubusercontent.com/vercel/next.js/v16.2.9/docs/01-app/03-api-reference/01-directives/use-client.mdx) was inspected before coding, rather than installing an environment solely to read it.

## Changed behavior

- The crop dialog shows the original image, shaded discarded areas, a movable frame and eight visible resize handles. Native pointer capture supports mouse/touch; keyboard arrows move/resize, with Shift for a larger step. A separate drag-to-move control keeps tiny selections usable when handle hit areas overlap. Small source images upscale to a bounded preview without letterboxing the coordinates.
- Crop changes remain local to the dialog until Save. Reset selects the full image; Cancel discards the draft. Save validates bounds, guards against duplicate saves and missing/replaced targets, and retains the dialog/selection on failure. A 20-second crop-save deadline releases the busy dialog on a stalled request and explains that the server result may be uncertain. Background canvas shortcuts are suspended while cropping.
- Normalization rejects missing, nonnumeric and nonfinite fields. Gestures keep image bounds and fixed opposite edges; normal crops have a 2% resize floor. Existing valid tiny crops keep their geometry until changed, and movement/one-axis resizing preserves unrelated dimensions.
- A cropped-image viewport fits the selected source aspect inside the canvas card. The existing object-cover mapping could hide additional source pixels when a freeform crop differed from the card aspect. Fitting the crop viewport preserves the chosen area and source proportions without changing card persistence or the original file.
- The existing end-to-end test source now uses actual pointer resize and keyboard movement instead of numeric form fields. It has not been executed by this repair.

Review caught the preexisting nonfinite normalization bug plus two integration risks: silently expanding a valid tiny crop before any user change, and showing a source-coordinate preview through an incompatible object-cover output. Both were addressed before source publication. Source review is not a substitute for rendered acceptance.

## Verification and remaining gates

- **Source-stage proof:** 22 focused frontend cases passed by executing the actual `tests/unit/crop.test.ts` cases on Node v24.21.0 with an ephemeral `node:test`/`node:assert` matcher adapter. The local project runner was unavailable. Native Vitest subsequently passed in the approved hosted dependency job described below. No package/config changes or backend imports were made for the initial source-stage harness.
- Cases cover normalization failures, rounded legacy payloads, original style compatibility, movement bounds, all edges/corners, minimum size/crossing, finite gesture axes, repeated operations, tiny/no-op/unrelated-axis preservation, viewport aspect examples and invalid geometry fallback.
- Exact changed-file parsing on Node v24.21.0 / TypeScript 5.9.3 passed for six TS/TSX files, with 30 local import targets resolved and both edited Markdown documents' local links present. `git diff --check` passed. These checks do not establish a local Next build, native test-runner acceptance or browser behavior.
- Local installation, broad TypeScript compilation and app builds remain stopped under Storage Guard (latest workspace preflight: 27.7 GiB free versus 34.0 GiB required). The initial crop implementation left dependencies/lockfile unchanged; the subsequent approved runtime upgrade is described below. Backend/Auth, provider settings and database schema remain unchanged.
- No Inspiration Canvas browser-check approval has been given. Do not reuse another app's approval. Desktop/mobile drag/resize/move, tiny and wide images, keyboard use, Reset/Cancel, failed-save preservation, storage reload and visual selected-area fidelity still need explicit acceptance with disposable authored content. Earlier native file-chooser restrictions have not been resolved by this source change.

No AI call, paid provider, upload, account creation, backend test, migration or production data mutation was used for this repair. Other product QA, including the inline-comment request, remains a separate scope to reconcile against current source. The overall multi-project goal remains active.

## Published source and blocked deployment

Source commit [`9e7ea07c787dbc4639e0134b7244f2dc1578d585`](https://github.com/alvarovillalbaa/inspiration-canvas/commit/9e7ea07c787dbc4639e0134b7244f2dc1578d585) is pushed. Authenticated GitHub readback matched local commit/tree `7d09eb281baef2f1d99f0d08280ec7b88ea72a20`, with a clean checkout after that source publication.

Production deployment `dpl_ERSNaquzpTJkWAkb9itua1Vu7ex8` matched this source and ended **ERROR**. Hosted output recorded Next 16.2.9 compilation success (21.2 seconds), TypeScript completion (7.1 seconds) and all 13 static pages generated. The completed build was refused at deployment with **“Unsupported Eve version detected (eve@0.13.8)”**, followed by a requirement for version 0.18.0 or later. The host cleared its build cache after the dependency security block. No retry or policy bypass was attempted.

The production alias still returned HTTP 200 after that refusal; the crop repair was not live at that point. This outcome does not verify interaction with the new crop controls. No rejected-deployment runtime scan is meaningful because that build was never served; drains and monitoring were not changed.

The owner subsequently answered **“Approve upgrade and checks”** for the [supported-runtime proposal](../../../proposals/eve-runtime-upgrade.md) and [temporary CI template](../../../proposals/eve-runtime-refresh.yml.example). That authorizes the narrow dependency/CI repair below; it does not authorize browser/backend tests or model calls.

Additional source-only QA reconciliation found comments already render directly beside selected media, without a global comments dialog. A separate bottom label/status strip remains against the text request to leave media bottoms clear. The referenced screenshot could not be fetched (DNS failure), so no visual screenshot comparison or speculative removal was performed.

## Approved supported-runtime repair

Pinned Eve `0.18.0` and AI SDK `7.0.15`. The generated lock initially tried to deduplicate `@vercel/queue`'s OIDC from 3.7.0 to 3.2.0; that candidate was not applied. A narrow pnpm override preserves its existing 3.7.0 resolution. No unrelated package version was deliberately upgraded. Registry deprecation metadata changed during regeneration.

Official source tag `eve@0.18.0` resolves to `67112781d3700b3024bfa9b0013eee1253814780`. Inspection confirmed the agent configuration, existing 11 camelCase tool filenames and `withEve(withWorkflow(nextConfig))` remain supported. Four tools require `needsApproval: () => true` renamed to `approval: () => true`; their app-level `createAgentApproval` bodies and callbacks remain unchanged. The versioned validator rejects the legacy field rather than silently ignoring it. No agent instruction, model selection, credential or approval policy was changed.

The temporary workflow used pinned official checkout/setup-node actions, Node 24.21.0, pnpm 10.24.0, ignored package lifecycle scripts, repository-read permission and a standard Ubuntu runner. It supplied no model/provider secrets, cache or artifact upload. Account billing reads were unavailable to the current token; no permission escalation or alternate credential was used. Public dependency diffs/checksums returned through job logs instead of artifact storage.

- Initial [run 40506815559](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/40506815559), head `c480f6a828aba439d00803a9249678ffd4d1cec1`, succeeded with 22 native crop tests, but its unrelated OIDC resolution was rejected during review.
- Final [run 40508065207](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/40508065207), head `bcb832ae8369fbe545e38de64f20821f222f662b`, job `122202416642`, succeeded. Native Vitest reported one test file and **22 tests passed**. Frozen installation accepted the generated lockfile. No backend test or browser ran.
- GitHub connector log readback recovered only `package.json` and `pnpm-lock.yaml` in the generated diff. Local bytes match its SHA-256 checksums: manifest `eea461091c0232b871d9da2d25052792efa19c9ca532a51372c6053c0b8ec588`; lock `3552cda6d3d13cb82f99f29c3d09b1b3228a2d2117d5dd521229600ba039c751`. YAML readback confirms the queue-to-OIDC dependency remains 3.7.0.

The temporary active workflow has been removed after successful readback. The non-executing template remains as review/provenance evidence. Native test success alone does not prove Eve runtime/provider behavior or visual crop acceptance.

## Supported production publication

Application source [`6cac55a00bc1114f19a2bcac46aad13f2d418a99`](https://github.com/alvarovillalbaa/inspiration-canvas/commit/6cac55a00bc1114f19a2bcac46aad13f2d418a99) reached `READY` in preview deployment `dpl_DGRyYLVx9Um6YLtL6qfooDQMSZpr`. Hosted output recorded compilation success, TypeScript completion and generated pages, followed by successful deployment; the old Eve security refusal was resolved. Main was then fast-forwarded to this exact reviewed commit.

Production deployment `dpl_D6q7yny2S83mT51dVhvYJHye72A3` also reached **READY**, targeting main at that same source commit and the existing project/team. Authenticated GitHub main readback matched the local commit and tree `c30f51111a0fa6a7eeb689ce6ba9c7167ba399e7`.

The public [production page](https://inspiration-canvas.vercel.app) returned HTTP 200 and referenced this deployment in its script URLs. Its actual page bundle returned 200 and contained the new crop title, resize-handle label, separate move control and save-timeout text. This verifies delivery of the repair; it does not exercise its events or browser persistence.

A deployment-scoped five-minute error/fatal log count query after the homepage fetch returned no groups. This is a narrow, low-traffic observation, not a claim of ongoing monitoring or complete runtime health. No drain or monitoring configuration was changed. No model/provider or signed-in backend flow was invoked.

The crop repair is now deployed. The production receipt/test-source commit `53705a81a8d05988d4a095a23aae83aaa30fd146` also reached `READY` in deployment `dpl_82TzkZ3PhZSsB8XnbjV27uYK2SLi`. The current Chrome file-chooser restriction is unchanged; the separately approved disposable CI browser acceptance uses authored fixtures without touching the owner's browser or production data.

## Focused browser acceptance

The owner answered **“Approve crop browser checks”** for the [four-case CI scope](../../../proposals/crop-browser-ci.md). The temporary branch is `qa/crop-browser-acceptance`; no active browser workflow is installed on main. The job supplies no provider credentials, uses browser-local authored PNG content and blocks all non-read HTTP requests. It does not invoke a signed-in backend, production data or AI.

First [run 40515651256](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/40515651256), source `94b54bf94b2c5dbf38bf6fcd5c51d7f33f25c1c3`, job `122228797860`, completed with **three desktop cases passed and one mobile case failed**, zero test retries. Desktop checks exercised mouse/keyboard selection, actual saved image geometry, reload/reopen, Reset/Cancel and a controlled local-storage save failure followed by successful retry.

Mobile stopped at its first touch-resize assertion: requested half width `0.5`, observed `0.5018629807692307`. That difference corresponds to less than one CSS pixel at this viewport, but the initial run did not record the actual delivered native touch positions, so it does not by itself establish an application defect or input quantization. A focused harness correction records trusted down/up coordinates and compares the crop against their delivered delta; persisted/rendered geometry keeps its original strict tolerance. The next run is justified by that concrete measurement correction, not a blind retry. Mobile acceptance remains unproven until that run completes.
