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

- **22 focused frontend cases passed** by executing the actual `tests/unit/crop.test.ts` cases on Node v24.21.0 with an ephemeral `node:test`/`node:assert` matcher adapter. The installed project runner was unavailable, and **native Vitest remains unrun**. No package/config changes or backend imports were made to obtain this proof.
- Cases cover normalization failures, rounded legacy payloads, original style compatibility, movement bounds, all edges/corners, minimum size/crossing, finite gesture axes, repeated operations, tiny/no-op/unrelated-axis preservation, viewport aspect examples and invalid geometry fallback.
- Exact changed-file parsing on Node v24.21.0 / TypeScript 5.9.3 passed for six TS/TSX files, with 30 local import targets resolved and both edited Markdown documents' local links present. `git diff --check` passed. These checks do not establish a local Next build, native test-runner acceptance or browser behavior.
- Local installation, broad TypeScript compilation and app builds remain stopped under Storage Guard (latest workspace preflight: 27.7 GiB free versus 34.0 GiB required). Existing dependencies, lockfile, backend/Auth, CI, provider settings and database schema are unchanged.
- No Inspiration Canvas browser-check approval has been given. Do not reuse another app's approval. Desktop/mobile drag/resize/move, tiny and wide images, keyboard use, Reset/Cancel, failed-save preservation, storage reload and visual selected-area fidelity still need explicit acceptance with disposable authored content. Earlier native file-chooser restrictions have not been resolved by this source change.

No AI call, paid provider, upload, account creation, backend test, migration or production data mutation was used for this repair. Other product QA, including the inline-comment request, remains a separate scope to reconcile against current source. The overall multi-project goal remains active.

## Published source and blocked deployment

Source commit [`9e7ea07c787dbc4639e0134b7244f2dc1578d585`](https://github.com/alvarovillalbaa/inspiration-canvas/commit/9e7ea07c787dbc4639e0134b7244f2dc1578d585) is pushed. Authenticated GitHub readback matched local commit/tree `7d09eb281baef2f1d99f0d08280ec7b88ea72a20`, with a clean checkout after that source publication.

Production deployment `dpl_ERSNaquzpTJkWAkb9itua1Vu7ex8` matched this source and ended **ERROR**. Hosted output recorded Next 16.2.9 compilation success (21.2 seconds), TypeScript completion (7.1 seconds) and all 13 static pages generated. The completed build was refused at deployment with **“Unsupported Eve version detected (eve@0.13.8)”**, followed by a requirement for version 0.18.0 or later. The host cleared its build cache after the dependency security block. No retry or policy bypass was attempted.

The current production alias still returned HTTP 200 after that refusal. **The crop repair is not live.** This outcome does not verify interaction with the new crop controls. No new-deployment runtime scan is meaningful because the new build was never served; drains and monitoring were not changed.

The [supported-runtime proposal](../../../proposals/eve-runtime-upgrade.md) and [temporary CI template](../../../proposals/eve-runtime-refresh.yml.example) are local review artifacts only. They have not been installed, run or published to GitHub. No dependency/configuration change is authorized merely by this failure; the owner must approve the §14 dependency/CI step. This receipt update is also local until the next authorized publication, to avoid automatically rebuilding the same rejected dependency set.

Additional source-only QA reconciliation found comments already render directly beside selected media, without a global comments dialog. A separate bottom label/status strip remains against the text request to leave media bottoms clear. The referenced screenshot could not be fetched (DNS failure), so no visual screenshot comparison or speculative removal was performed.
