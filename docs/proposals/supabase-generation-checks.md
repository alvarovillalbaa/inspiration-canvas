# Supabase generation contracts — prepared, not run

7 November 2026. This packet covers only the four newly authored unit files:
`supabase-generation-runs.test.ts`, `supabase-child-generation.test.ts` and
`supabase-child-routes.test.ts`, plus `supabase-child-ai.test.ts`.
The [controller](../../tests/scripts/run-supabase-generation-checks.py) pins all
76 literal full test names and complete authored-file hashes, checked against
the current native sources. Counts are 21 repository, 25 coordinator, 23 route
and seven SDK-policy cases. These are prepared identities, not passing results.
Root still reviews the packet and supplies its immutable source pin before
activation. Existing transfer/PostgreSQL,
crop/metadata and browser results remain at their original sources; none rerun.

The [inactive example](supabase-generation-checks.workflow.yml.example) allows one
public Ubuntu 24.04 job on `qa/supabase-generation-20261107-1`, with an exact
`SOURCE_COMMIT`, Node 24.21.0 and 20-minute job limit. Work is bounded to 1020 s,
cleanup to 90 s and final stdout to 2 s. No workflow is activated by preparation.
Standing owner approval covers this focused unit/static work; actual acceptance
remains unrun. Local Storage Guard prohibits installs, builds and app runtime.

The existing package/lock stay unchanged: pnpm 10.24.0, Next 16.2.9, Eve 0.18.0,
TypeScript 5.9.3 and Vitest 4.1.9. The official
[pnpm 10.24.0 release](https://github.com/pnpm/pnpm/releases/tag/v10.24.0)
lists the Linux x64 asset as 65,768,111 bytes, SHA256
`985824ae016db3c7bbd7b39dcb4e6f5740b11cce79f5c43d5e5e640768fd4806`.
CI downloads only this asset through bounded HTTPS redirects in an owned tracked
child: 90-second internal total deadline and a separately enforced 95-second
parent deadline. The controller does not perform a potentially blocking network
read itself. Only redirect hostnames are retained; signed redirect URLs are not.
It verifies bytes/hash again before executable permissions and checks the actual
version. It installs the frozen lock with
lifecycle scripts disabled into an isolated export. Vitest, ESLint and TypeScript
are invoked through setup-node's explicit Node 24 binary, rather than claiming
the standalone pnpm executable's embedded runtime is the test runtime. No global
install or Corepack activation occurs. Registry metadata could not be read during
preparation; that source-access limit is not an application failure.

The runner's original HOME is preserved. Caches, user/global npm files, pnpm
store, config/data/state, temporary files, compile cache, export and outputs have
explicit paths under one new owned 0700 root. Child environments use an allowlist,
inherit no provider/GitHub credentials and disable AI/Eve development/local DB
activation. Only the four new files are exported from `tests/unit`; the actual
application modules/configuration are copied for real transitive type resolution.
No dependency, application, old test or old runner source is edited.

A generated scratch-only Vitest configuration selects exactly those four files,
one worker, no retries and Node environment. Auth/SDK/storage/model leaves are
authored mocks. Unit setup rejects unexpected fetch/Node TCP/TLS/HTTP calls;
these in-process tripwires are not an OS egress sandbox. There is no real model,
provider HTTP, database, browser, server or application build. Scoped ESLint and
TypeScript cover the seven changed application entries plus the four test files,
with TypeScript resolving their actual imports.

The additional AI policy file exercises the actual child AI helpers with SDK
leaves mocked: AbortSignal/zero-retry option forwarding, missing credentials and
unchanged default local behavior. Coordinator checks cover the shared 45-second
deadline; the route declares a 60-second maximum. These are authored contract
checks, not measured provider/network timing or real generation. No earlier
three-file count is frozen or carried into this expanded manifest.

The controller checks complete native HEAD/index/path/mode/Git-blob/byte/SHA
vectors before and after work and cleanup. Export inputs must stay exact.
Each command retains bounded original stdout/stderr with gzip/base64, byte/hash,
observed byte/hash, EOF/reaping/descriptor/group evidence; unit JSON is separately
retained and must agree with the exact four-file, unique passed-test manifest.
No skips, failures, unexpected cases or nonzero CLI exit are accepted. Overflow,
timeouts, interruption, signals or uncertain process ownership fail acceptance.
Cleanup first permits two seconds of normal shutdown, then bounded TERM and KILL
phases for freshly revalidated owned PIDs, reserving time for direct-child reaping
and final observation inside the same 90-second limit. Every actual signal stays
an acceptance failure. Tracked children must be reaped, descriptors closed,
original pipes at EOF and groups absent, with no final unknown ownership, before
identity-checked scratch removal. Missing EOF cannot be repaired by relabeling
a later process exit. Bounded failure locations contain only basename, line and
function metadata, not exception messages, locals or raw stack content.

This establishes mocked protocol/control-flow contracts and scoped static
compatibility only. It does not establish hosted auth/RLS, a deployed workflow,
provider generation, persistent DB effects, UI behavior or full-product completion.
The [old transfer runner](../../tests/scripts/run-transfer-checks.py) remains
byte-exact and its original evidence remains separate.
