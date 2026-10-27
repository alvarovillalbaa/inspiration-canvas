# Focused crop browser acceptance proposal

Last updated: 2026-10-27

**Status: owner approved “Approve crop browser checks” on 27 October 2026.** The [workflow example](crop-browser-ci.yml.example) remains inactive documentation; its temporary installation and actual run evidence are recorded in the crop receipt. The supplied AGENTS.md §7 requires approval for browser checks, and §14 requires approval for temporary CI changes. Earlier dependency-upgrade or another application's browser approval did not cover this run.

## Proposed scope

Run only [`tests/e2e/crop.spec.ts`](../../tests/e2e/crop.spec.ts) in Chromium against an anonymous Next development server at `http://127.0.0.1:3100` inside a disposable GitHub-hosted runner. The focused source defines its own desktop (1440 × 1000) and mobile (390 × 844, touch-enabled) profiles, so the temporary configuration has one Chromium project rather than duplicating both profiles across two projects.

The intended four cases cover:

- Desktop mouse resize, keyboard movement, saved crop geometry and reload persistence.
- Cancel and Reset without saving, followed by an explicitly saved reset.
- A controlled browser-storage write failure that keeps the crop draft available for retry.
- Mobile-emulated touch resize/movement, saved geometry and reload persistence.

The cases use authored image bytes through Playwright's file-input API and disposable browser storage. They do not sign in, create a provider account, invoke models, upload to a hosted service, or run the broader canvas/AI suite. Final source review must confirm this boundary before activation. No backend test command, migration, database setup, production browser check or full Next build is included.

## Concrete temporary job

After approval, install the reviewed example as `.github/workflows/crop-browser-acceptance.yml` **only on `qa/crop-browser-acceptance`**, based on the reviewed crop source. The trigger requires that exact branch and a change to the workflow or its single focused test file. The focused-test trigger was added after the concrete animation-measurement failure so corrected test source can receive the same bounded verification. The job additionally requires the canonical public repository `alvarovillalbaa/inspiration-canvas`. There is no schedule, pull-request trigger, dispatch trigger or main-branch installation.

The job uses a standard `ubuntu-24.04` runner with a ten-minute job deadline and `contents: read` only. Checkout and setup-node use the reviewed full commit pins in the example; checkout does not retain credentials. Node is pinned to 24.21.0 and pnpm to 10.24.0. It installs the existing frozen lockfile with lifecycle scripts disabled, then installs Chromium and its Linux system dependencies in the disposable runner. It does not regenerate dependency files, enable paid/larger runners, save a package/browser cache or upload artifacts. [GitHub documents standard hosted runner usage as free for public repositories.](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

The example generates `.crop-ci.playwright.config.ts` only in that runner. Its `testMatch` selects exactly `crop.spec.ts`; one worker, zero retries, a five-minute Playwright deadline and per-test deadlines bound the run. The line reporter writes results to the public job log; trace, screenshot and video recording are off. If a case fails, at most four owned failure-context text files contribute their first 120 lines to that log; no user browser or production content is involved. [Playwright documents browser installation and single-worker CI use](https://playwright.dev/docs/ci), [file/project selection](https://playwright.dev/docs/test-configuration) and [test/global timeouts](https://playwright.dev/docs/test-timeouts).

The generated configuration starts a fresh local Next development server and sets `ENABLE_AI=false`, `ENABLE_EVE_DEV=false`, local storage mode, disabled Next telemetry and empty Supabase, Blob and AI credential variables. The source's existing development opt-in keeps Eve off, and the application has no configured Supabase client. The workflow references no owner secrets or deployment environment. [`playwright.config.ts`](../../playwright.config.ts), [`next.config.ts`](../../next.config.ts), package files and production configuration remain unchanged. [Playwright's `webServer` option owns the temporary server lifecycle.](https://playwright.dev/docs/test-webserver)

If dependency installation, native packages, compilation or a timeout prevents execution, record and diagnose that failure. A concrete source/harness correction may justify a new focused run within the same approved scope. Keep per-test retries at zero; do not blindly rerun, remove frozen-lockfile/lifecycle-script restrictions, broaden the suite, add credentials or increase the runner budget to obtain a green result. A permission/provider gate must be reported rather than bypassed.

## Evidence and removal

Record the tested source SHA, workflow commit/run URL, terminal conclusion and exact pass/fail/skip counts in the [crop repair receipt](../results/2026/10-27/visual-crop.md). A skipped mobile case is not mobile acceptance. Preserve a concise public failure excerpt when a case fails. The job has no permission to commit or publish a result itself; the authorized owner performs the receipt update after reading back the run.

After focused acceptance finishes, remove the temporary workflow from its maintenance branch and verify that no active copy remains. Retain these proposal files as the reviewed design and record the workflow-removal commit in the receipt. Do not merge the temporary workflow into main. Record each run and the concrete change/failure that justified any repetition.

A successful hosted-runner result establishes the declared local anonymous browser interactions on that tested source. It does **not** establish the public Vercel deployment's behavior, signed-in/Supabase persistence, real hardware or Safari behavior, or native file-picker operation. Playwright file-input injection does not resolve the original Chrome file-chooser gate. Existing local storage/build restrictions and all other projects' pending approvals remain in force.
