# Request-bound Supabase child generation

Status: source candidate; no hosted, model, database, or request-lifetime acceptance.

`lib/workflows/supabase-child-generation.ts` exports
`runSupabaseChildGeneration({ supabase, userId, canvasId, mediaIds, prompt?, signal? })`,
returning `{ run, media, prompt }` only after confirmed completion. The caller
must await it inside the authenticated request. No Supabase client, session,
cookie, access token, service key, or actor ID is serialized into a workflow.
The existing local workflow and repository remain separate.

Both model helpers receive the same 45-second deadline, combined with the
request's abort signal when supplied, and `maxRetries: 0`. This explicitly
disables the AI SDK's default model retries for this coordinator only. Abort
checks precede each new model, metadata, or storage phase, child insertion, and
completion update. An image returned after an observed deadline is not saved.
Storage and database calls already in flight are not globally abortable here;
neither this budget nor cancellation proves a provider stopped work or billing.
If cancellation arrives during completion, only an exact already-complete
run/media readback can recover success. No new completion write is started
after cancellation has been observed.
Pre-storage cancellation may still attempt a running-only failed-state CAS as
failure bookkeeping inside the remaining platform budget. This is not a new
generation or publication. After a storage attempt, cancellation stays
unconfirmed and retains objects without a failed-state overwrite.

The coordinator checks the client's authenticated user, then the owned canvas
and every distinct parent. It refreshes those checks before model work, storage
writes, and child insertion. These are separate authenticated requests, not a
transaction, ownership lock, or guarantee against concurrent deletion. Pending
to running and running to complete/failed use the repository's status CAS.
Other callers that omit CAS do not gain a global terminal-state guarantee.

Generated output must be one of the existing supported image formats, match
upload validation, fit the configured upload limit, and yield image dimensions.
Original and thumbnail use fresh user-prefixed keys, configured Blob storage or
the authenticated Supabase adapter. This preserves the existing public-URL
storage contract; it is not private-media delivery or a new bucket policy.
The generated child is inserted with its complete metadata and a predetermined
UUID. Lost insertion/completion responses are reconciled only against that exact
owned UUID, all expected media fields, and the expected complete run receipt.

`SupabaseChildGenerationError` exposes only finite messages, `runId: string | null`,
and `code: invalid_request | not_found | credentials | unconfirmed | failed`.
Suggested route mappings are 400/404/402/503/500 respectively; awaited completion
is 200, never a durable-job 202. Definite failures before storage attempt a
running-only failed transition. After any storage write attempt, unconfirmed
outcomes retain objects and never blindly delete, retry insertion, regenerate,
or mark the run failed. Later owner edits are not overwritten to reconcile an
earlier result. An unacknowledged run creation may have no recoverable run ID.
Retained objects can remain orphaned; this scope does not add garbage collection.

Request termination can leave pending/running state. Owner-scoped polling can
observe persisted state but cannot resume execution or prove a missing write
never committed. The route/UI owner must authenticate before any workflow-engine
lookup, avoid local/engine fallback in Supabase mode, and retain an uncertainty
message rather than automatically generating again. Existing global polling
routes and the delayed client reload do not supply this contract by themselves.
The route owner sets a 60-second platform `maxDuration`; the shared model budget
is 45 seconds, not a hard bound on all database/storage I/O or a guarantee that
the request will survive that long. Platform termination remains uncertain and
does not make the request durable. No schema, dependency, account, or AI policy
change is included.

The 25 authored cases in `tests/unit/supabase-child-generation.test.ts` mock the
request/SDK/model/storage boundaries. They cover ownership, CAS, supported output,
lost responses, later edits/completions, shared cancellation/retry options, and
retained objects. They are not auth,
RLS, actual image-decoder, real provider, hosted, or browser proof. Only static
syntax and whitespace checks are authorized locally for this source candidate.
