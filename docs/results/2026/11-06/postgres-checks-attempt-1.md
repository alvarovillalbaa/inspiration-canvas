# PostgreSQL check preparation: first lock guard rejection

[Run 42138466899](https://github.com/alvarovillalbaa/inspiration-canvas/actions/runs/42138466899),
job `127632483698`, failed on prepared source
`9298c1a4763bd4a0320fb63c11b602ac963e3720` / activation
`4ac34cd3c069bd5202039716d92877183622e3b4`.
The job ran 00:39:58–00:41:02 UTC on 6 November 2026, within 20 minutes.

`pnpm@10.24.0 install --lockfile-only --ignore-scripts` exited zero. The next
guard rejected Eve's changed peer-context entry as an unrelated dependency
change. Eve itself remained exactly 0.18.0; PostgreSQL and its types appeared
inside the old optional Drizzle peer context. No unit/integration/browser case,
app server, configured database query or frozen dependency installation ran.

The [original controller result](postgres-checks-attempt-1.json) is 17,610 bytes,
SHA-256 `3569edef2630a5b775ba75653072269743a3521a4436ced6d91ea2f8b633896d`.
Both complete command streams, lengths and hashes were independently decoded
and checked. Source guards passed, no owned/new uncertain process remained and
the disposable scratch directory was removed. The explicit database-drop phase
was not reached; GitHub's owned service-container stop step succeeded. There is
no application or database-acceptance claim from this attempt.

Inspection exposed retained optional `db0` bindings to the removed local drivers.
The next preparation must handle those narrowly and preserve retained direct
package versions; it must not hide these packages or label this attempt passing.
The temporary workflow is disabled and its branch retired before replacement.
