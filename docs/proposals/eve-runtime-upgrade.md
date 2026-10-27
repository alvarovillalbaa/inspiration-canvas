# Supported Eve runtime proposal

Status: owner approved the upgrade and hosted checks on 27 October 2026. Implementation/run evidence will be recorded in the crop receipt. No paid plan, model call or provider configuration change is included.

## Concrete blocker

Crop source [`9e7ea07c787dbc4639e0134b7244f2dc1578d585`](https://github.com/alvarovillalbaa/inspiration-canvas/commit/9e7ea07c787dbc4639e0134b7244f2dc1578d585) compiled and passed hosted TypeScript, but production deployment `dpl_ERSNaquzpTJkWAkb9itua1Vu7ex8` ended `ERROR` at Vercel's dependency security check. Its final output says Eve 0.13.8 is unsupported and requires 0.18.0 or later. The previous production page still returns HTTP 200. Rebuilding the unchanged dependency set would not fix the refusal.

## Proposed change

1. Pin `eve` from `^0.13.8` to `0.18.0`, the minimum accepted version named by the host. Pin the direct `ai` dependency from `7.0.0-beta.178` to `7.0.15`, already present transitively in this lockfile, to satisfy Eve 0.18.0's stable `^7.0.0` peer. npm metadata confirms Node >=24; this project already targets Node 24 in Vercel. Candidate compatibility is not yet established.
2. Regenerate the pnpm 10.24.0 lockfile with the package manager. Do not hand-edit the generated lock. Local dependencies/tool installation remains stopped under Storage Guard, and no pnpm binary/cache was found in the bounded checked locations. Use the [temporary hosted job proposal](eve-runtime-refresh.yml.example) on an explicitly scoped maintenance branch instead.
3. The job has repository-read permission only, a ten-minute standard Ubuntu runner, no secrets, no cache, ignored lifecycle scripts and only the focused frontend crop test. It returns the generated public manifest/lock diff with SHA-256 checksums in the run log, with no artifact upload. Verify the exact source commit, apply only the intended generated files, then remove the temporary workflow after readback. Do not install a general CI pipeline.
4. Check `defineAgent`, `defineTool` and `withEve` against the accepted version. Make only required compatibility edits if the hosted build identifies them. Preserve approval-gated mutations and every existing Curator capability. Keep full-agent/model/provider calls outside this scope.
5. Publish the reviewed upgrade through the existing Git/Vercel connection, inspect the exact commit's terminal state/build logs and public HTTP result. Browser/backend acceptance still needs its own approval. No new provider, paid plan, migration or credential change is proposed.

The [npm Eve 0.18.0 metadata](https://registry.npmjs.org/eve/0.18.0) declares `ai:^7.0.0`; the other advertised peers are optional. The versioned API type pages could not be fetched during proposal research, so export-name compatibility is deliberately unverified. [pnpm documents lockfile-only generation](https://pnpm.io/cli/install#--lockfile-only), but the absent local runner is not a reason to install through the failed storage gate.

[GitHub documents standard hosted runner minutes as free for public repositories and job logs as outside artifact storage](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Billing reads returned 404 with a missing `user` scope; no permission refresh or retry was attempted. The job was narrowed to emit only a public dependency diff/checksums in logs, avoiding unverified shared artifact capacity. No artifact upload, cache, overage, paid runner or subscription is included.

The supplied AGENTS.md §14 requires approval for dependency and CI/CD changes. The owner answered **“Approve upgrade and checks”** for this documented upgrade and temporary hosted job. That approval does not authorize browser/backend tests, model calls, unrelated dependencies or billing changes.
